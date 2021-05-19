# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from http import HTTPStatus
import json

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
from botbuilder.core.integration import (
    aiohttp_channel_service_routes,
    aiohttp_error_middleware,
)

from botbuilder.schema import Activity
# from botbuilder.integration.aiohttp.skills import SkillHttpClient
from botframework.connector.auth import (
    AuthenticationConfiguration,
    SimpleCredentialProvider,
)

from authentication import AllowedSkillsClaimsValidator
from bots import RootBot
from dialogs import MainDialog
from dialogs.telemetry_listener_middleware import TelemetryListenerMiddleware, AppInsightsClient
from dialogs.skill_http_client_listener import SkillHttpClientListener
from skills_configuration import DefaultConfig, SkillsConfiguration
from adapter_with_error_handler import AdapterWithErrorHandler
from skill_conversation_id_factory import SkillConversationIdFactory
from token_exchange_skill_handler import TokenExchangeSkillHandler

import logging
from opencensus.ext.azure.log_exporter import AzureEventHandler

CONFIG = DefaultConfig()
SKILL_CONFIG = SkillsConfiguration()

# Create MemoryStorage, UserState and ConversationState
MEMORY = MemoryStorage()
USER_STATE = UserState(MEMORY)
CONVERSATION_STATE = ConversationState(MEMORY)
ID_FACTORY = SkillConversationIdFactory(MEMORY)

CREDENTIAL_PROVIDER = SimpleCredentialProvider(CONFIG.APP_ID, CONFIG.APP_PASSWORD)

LOGGER = logging.getLogger(__name__)
LOGGER.addHandler(AzureEventHandler
    (connection_string=f"InstrumentationKey={CONFIG.APPINSIGHTS_INSTRUMENTATIONKEY}"))

TELEMETRY_CLIENT = AppInsightsClient(LOGGER)

telemetryLoggerMiddleware = TelemetryListenerMiddleware('WaterfallHostBot', TELEMETRY_CLIENT, True)

CLIENT = SkillHttpClientListener(CREDENTIAL_PROVIDER, ID_FACTORY, TELEMETRY_CLIENT)

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
