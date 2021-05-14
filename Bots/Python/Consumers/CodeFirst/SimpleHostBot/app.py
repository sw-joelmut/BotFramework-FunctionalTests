# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import json
from typing import Dict
from aiohttp import web
from aiohttp.web import Request, Response
from aiohttp.web_middlewares import middleware
from botbuilder.core import (
    BotFrameworkAdapterSettings,
    ConversationState,
    MemoryStorage,
)
from botbuilder.core.bot_telemetry_client import BotTelemetryClient
from botbuilder.core.integration import (
    aiohttp_channel_service_routes,
    aiohttp_error_middleware,
)
from botbuilder.core.skills import SkillHandler
from botbuilder.core.telemetry_logger_constants import TelemetryLoggerConstants
from botbuilder.core.telemetry_logger_middleware import TelemetryLoggerMiddleware
from botbuilder.integration.aiohttp.skills import SkillHttpClient
from botbuilder.schema import Activity
from botframework.connector.auth import (
    AuthenticationConfiguration,
    SimpleCredentialProvider,
)

from dialogs import SetupDialog
from skill_conversation_id_factory import SkillConversationIdFactory
from authentication import AllowedSkillsClaimsValidator
from bots import HostBot
from config import DefaultConfig, SkillConfiguration
from adapter_with_error_handler import AdapterWithErrorHandler

import logging
from opencensus.ext.azure.log_exporter import AzureEventHandler, AzureLogHandler

from middleware import CustomMiddleware

CONFIG = DefaultConfig()
SKILL_CONFIG = SkillConfiguration()

# Whitelist skills from SKILL_CONFIG
AUTH_CONFIG = AuthenticationConfiguration(
    claims_validator=AllowedSkillsClaimsValidator(CONFIG).claims_validator
)
# Create adapter.
# See https://aka.ms/about-bot-adapter to learn more about how bots work.
SETTINGS = BotFrameworkAdapterSettings(
    app_id=CONFIG.APP_ID,
    app_password=CONFIG.APP_PASSWORD,
    auth_configuration=AUTH_CONFIG,
)

STORAGE = MemoryStorage()
CONVERSATION_STATE = ConversationState(STORAGE)

ID_FACTORY = SkillConversationIdFactory(STORAGE)
CREDENTIAL_PROVIDER = SimpleCredentialProvider(CONFIG.APP_ID, CONFIG.APP_PASSWORD)
CLIENT = SkillHttpClient(CREDENTIAL_PROVIDER, ID_FACTORY)

LOGGER = logging.getLogger(__name__)
LOGGER.addHandler(AzureLogHandler
    (connection_string=f"InstrumentationKey={CONFIG.APPINSIGHTS_INSTRUMENTATIONKEY}"))

ADAPTER = AdapterWithErrorHandler(
    SETTINGS, CONFIG, CONVERSATION_STATE, LOGGER, CLIENT, SKILL_CONFIG,
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

telemetryLoggerMiddleware = TelemetryListenerMiddleware('SimpleHostBot', TELEMETRY_CLIENT, True)

ADAPTER.use(telemetryLoggerMiddleware)

# Create the Bot
DIALOG = SetupDialog(CONVERSATION_STATE, SKILL_CONFIG)
BOT = HostBot(CONVERSATION_STATE, SKILL_CONFIG, CLIENT, CONFIG, DIALOG)

SKILL_HANDLER = SkillHandler(ADAPTER, BOT, ID_FACTORY, CREDENTIAL_PROVIDER, AUTH_CONFIG)

# Listen for incoming requests on /api/messages
async def messages(req: Request) -> Response:
    # Main bot message handler.
    TELEMETRY_CLIENT.track_event("SimpleHostBot in /api/messages")
    if "application/json" in req.headers["Content-Type"]:
        body = await req.json()
    else:
        return Response(status=415)

    TELEMETRY_CLIENT.track_event("SimpleHostBot in messages", {'custom_dimensions': {'activity': json.dumps(body)}})

    activity = Activity().deserialize(body)
    auth_header = req.headers["Authorization"] if "Authorization" in req.headers else ""

    TELEMETRY_CLIENT.track_event("SimpleHostBot activity", {'custom_dimensions':{'activity':json.dumps(activity.as_dict())}})

    try:
        await ADAPTER.process_activity(activity, auth_header, BOT.on_turn)
        return Response(status=201)
    except Exception as exception:
        LOGGER.exception(f"Error: {exception}", extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'SimpleHostBot'}})
        raise exception

# MIDDLEWARE = CustomMiddleware(LOGGER)


# @middleware
# async def custom_middleware(request: Request, handler):
#     activity = await request.json()
#     LOGGER.warning('RequestMiddleware', extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'SimpleHostBot', 'activity': str(activity)}})
#     response = await handler(request)
#     return response

APP = web.Application(middlewares=[aiohttp_error_middleware])
APP.router.add_post("/api/messages", messages)
APP.router.add_routes(aiohttp_channel_service_routes(SKILL_HANDLER, "/api/skills"))

if __name__ == "__main__":
    try:
        web.run_app(APP, host="localhost", port=CONFIG.PORT)
    except Exception as error:
        LOGGER.exception(f"Error: {error}", extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'SimpleHostBot'}})
        raise error
