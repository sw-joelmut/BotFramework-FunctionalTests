# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from http import HTTPStatus
import json
from typing import Dict

from aiohttp import web
from aiohttp.web import Request, Response
from aiohttp.web_middlewares import middleware
from aiohttp.web_response import json_response
from botbuilder.core import (
    BotFrameworkAdapterSettings,
    ConversationState,
    MemoryStorage,
    UserState,
)
from botbuilder.core.bot_telemetry_client import BotTelemetryClient
from botbuilder.core.integration import (
    aiohttp_channel_service_routes,
    aiohttp_error_middleware,
)
from botbuilder.core.telemetry_logger_constants import TelemetryLoggerConstants
from botbuilder.core.telemetry_logger_middleware import TelemetryLoggerMiddleware
from botbuilder.schema import Activity
from botbuilder.integration.aiohttp.skills import SkillHttpClient
from botframework.connector.auth import (
    AuthenticationConfiguration,
    SimpleCredentialProvider,
)

from authentication import AllowedSkillsClaimsValidator
from bots import RootBot
from dialogs import MainDialog
from skills_configuration import DefaultConfig, SkillsConfiguration
from adapter_with_error_handler import AdapterWithErrorHandler
from skill_conversation_id_factory import SkillConversationIdFactory
from token_exchange_skill_handler import TokenExchangeSkillHandler

import logging
from opencensus.ext.azure.log_exporter import AzureEventHandler, AzureLogHandler

CONFIG = DefaultConfig()
SKILL_CONFIG = SkillsConfiguration()

# Create MemoryStorage, UserState and ConversationState
MEMORY = MemoryStorage()
USER_STATE = UserState(MEMORY)
CONVERSATION_STATE = ConversationState(MEMORY)
ID_FACTORY = SkillConversationIdFactory(MEMORY)

CREDENTIAL_PROVIDER = SimpleCredentialProvider(CONFIG.APP_ID, CONFIG.APP_PASSWORD)
CLIENT = SkillHttpClient(CREDENTIAL_PROVIDER, ID_FACTORY)

LOGGER = logging.getLogger(__name__)
LOGGER.addHandler(AzureLogHandler
    (connection_string=f"InstrumentationKey={CONFIG.APPINSIGHTS_INSTRUMENTATIONKEY}"))

# Whitelist skills from SKILLS_CONFIG
AUTH_CONFIG = AuthenticationConfiguration(
    claims_validator=AllowedSkillsClaimsValidator(SKILL_CONFIG).claims_validator
)

# Create adapter.
# See https://aka.ms/about-bot-adapter to learn more about how bots work.
SETTINGS = BotFrameworkAdapterSettings(CONFIG.APP_ID, CONFIG.APP_PASSWORD)
ADAPTER = AdapterWithErrorHandler(
    SETTINGS, CONFIG, CONVERSATION_STATE, LOGGER, CLIENT, SKILL_CONFIG
)

class AppInsightsClient():
    def __init__(
        self,
        instrumentation_key: str
    ):
        self.logger = logging.getLogger(__name__)
        self.logger.addHandler(AzureEventHandler(connection_string=f"InstrumentationKey={instrumentation_key}"))
        LOGGER.setLevel(logging.INFO)

    def track_event(
        self,
        name: str,
        properties: Dict[str, object] = None,
        measurements: Dict[str, object] = None,
    ) -> None:
        self.logger.info(msg=name, extra=properties)

TELEMETRY_CLIENT = AppInsightsClient(CONFIG.APPINSIGHTS_INSTRUMENTATIONKEY)

class TelemetryListenerMiddleware(TelemetryLoggerMiddleware):
    def __init__(
        self, bot: str, telemetry_client: BotTelemetryClient, log_personal_information: bool
    ) -> None:
        super().__init__(telemetry_client, log_personal_information)
        self._from = bot
        self._telemetry_client = telemetry_client
        self._log_personal_information = log_personal_information

    async def on_receive_activity(self, activity: Activity) -> None:
        self.telemetry_client.track_event(
            name=TelemetryLoggerConstants.BOT_MSG_RECEIVE_EVENT,
            properties={
                'custom_dimensions':{
                    'from': self._from,
                    'to': activity.from_property.name if activity.from_property else '',
                    'conversationId': activity.conversation.id if activity.conversation else '',
                    'activityId': activity.id,
                    'activityText': activity.text,
                    'activity': json.dumps(activity.as_dict(False))
                }
            },
        )

    async def on_send_activity(self, activity: Activity) -> None:
        self.telemetry_client.track_event(
            name=TelemetryLoggerConstants.BOT_MSG_SEND_EVENT,
            properties={
                'custom_dimensions':{
                    'from': self._from,
                    'to': activity.from_property.id if activity.from_property else '',
                    'conversationId': activity.conversation.id if activity.conversation else '',
                    'activityId': activity.id,
                    'activityText': activity.text,
                    'activity': json.dumps(activity.as_dict(False))
                }
            },
        )

telemetryLoggerMiddleware = TelemetryListenerMiddleware('WaterfallHostBot', TELEMETRY_CLIENT, True)

ADAPTER.use(telemetryLoggerMiddleware)

DIALOG = MainDialog(CONVERSATION_STATE, ID_FACTORY, CLIENT, SKILL_CONFIG, CONFIG)

# Create the Bot
BOT = RootBot(CONVERSATION_STATE, DIALOG)

SKILL_HANDLER = TokenExchangeSkillHandler(
    ADAPTER,
    BOT,
    CONFIG,
    ID_FACTORY,
    SKILL_CONFIG,
    CLIENT,
    CREDENTIAL_PROVIDER,
    AUTH_CONFIG,
)


# Listen for incoming requests on /api/messages
async def messages(req: Request) -> Response:
    # Main bot message handler.
    TELEMETRY_CLIENT.track_event("WaterFallHostBot in /api/messages")
    if "application/json" in req.headers["Content-Type"]:
        body = await req.json()
    else:
        return Response(status=HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
    TELEMETRY_CLIENT.track_event("WaterFallHostBot in messages", {'custom_dimensions':{'activity':json.dumps(body)}})

    activity = Activity().deserialize(body)
    auth_header = req.headers["Authorization"] if "Authorization" in req.headers else ""

    TELEMETRY_CLIENT.track_event("WaterFallHostBot activity", {'custom_dimensions':{'activity':json.dumps(activity.as_dict())}})

    try:
        invoke_response = await ADAPTER.process_activity(activity, auth_header, BOT.on_turn)

        if invoke_response:
            TELEMETRY_CLIENT.track_event("WaterFallHostBot Processed activity with Adapter. Invoke_response:", {'custom_dimensions':{'activity':json.dumps(invoke_response.body)}})
            return json_response(data=invoke_response.body, status=invoke_response.status)
        TELEMETRY_CLIENT.track_event("WaterFallHostBot Processed activity with Adapter. Invoke_response: Normal delivery mode")
        return Response(status=HTTPStatus.OK)
    except Exception as exception:
        LOGGER.exception(f"Error: {exception}", extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'WaterfallHostBot'}})
        raise exception

# @middleware
# async def custom_middleware(request: Request, handler):
#     activity = await request.json()
#     LOGGER.warning('RequestMiddleware', extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'WaterfallHostBot', 'activity': str(activity)}})
#     response = await handler(request)
#     return response

APP = web.Application(middlewares=[aiohttp_error_middleware])
APP.router.add_post("/api/messages", messages)
APP.router.add_get("/api/messages", messages)
APP.router.add_routes(aiohttp_channel_service_routes(SKILL_HANDLER, "/api/skills"))

if __name__ == "__main__":
    try:
        web.run_app(APP, host="localhost", port=CONFIG.PORT)
    except Exception as error:
        LOGGER.exception(f"Error: {error}", extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'WaterfallHostBot'}})
        raise error
