# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import json
import os
from datetime import datetime
from http import HTTPStatus
import traceback
from typing import Dict
from aiohttp import web
from aiohttp.web import Request, Response, json_response
from aiohttp.web_middlewares import middleware
from botbuilder.core import (
    BotFrameworkAdapterSettings,
    ConversationState,
    MemoryStorage,
    TurnContext,
    TelemetryLoggerMiddleware
)
from botbuilder.core.bot_telemetry_client import BotTelemetryClient
from botbuilder.core.skills import SkillHandler
from botbuilder.core.integration import (
    aiohttp_channel_service_routes,
    aiohttp_error_middleware,
)
from botbuilder.core.telemetry_logger_constants import TelemetryLoggerConstants
from botbuilder.integration.aiohttp.skills import SkillHttpClient
from botbuilder.schema import Activity
from botframework.connector.auth import (
    AuthenticationConfiguration,
    SimpleCredentialProvider,
)
from authentication import AllowedCallersClaimsValidator
from bots import SkillBot
from config import DefaultConfig
from dialogs import ActivityRouterDialog
from dialogs.proactive import ContinuationParameters
from middleware import SsoSaveStateMiddleware
from skill_conversation_id_factory import SkillConversationIdFactory
from skill_adapter_with_error_handler import AdapterWithErrorHandler

import logging
from opencensus.ext.azure.log_exporter import AzureEventHandler, AzureLogHandler

CONFIG = DefaultConfig()

# Create MemoryStorage and ConversationState.
MEMORY = MemoryStorage()
CONVERSATION_STATE = ConversationState(MEMORY)

# Create the conversationIdFactory.
CONVERSATION_ID_FACTORY = SkillConversationIdFactory(MEMORY)

# Create the credential provider.
CREDENTIAL_PROVIDER = SimpleCredentialProvider(CONFIG.APP_ID, CONFIG.APP_PASSWORD)

VALIDATOR = AllowedCallersClaimsValidator(CONFIG).claims_validator
AUTH_CONFIG = AuthenticationConfiguration(claims_validator=VALIDATOR)

# Create adapter.
# See https://aka.ms/about-bot-adapter to learn more about how bots work.
SETTINGS = BotFrameworkAdapterSettings(
    app_id=CONFIG.APP_ID,
    app_password=CONFIG.APP_PASSWORD,
    auth_configuration=AUTH_CONFIG,
)

LOGGER = logging.getLogger(__name__)
LOGGER.addHandler(AzureLogHandler
    (connection_string=f"InstrumentationKey={CONFIG.APPINSIGHTS_INSTRUMENTATIONKEY}"))

ADAPTER = AdapterWithErrorHandler(SETTINGS, CONVERSATION_STATE, LOGGER)

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

telemetryLoggerMiddleware = TelemetryListenerMiddleware('WaterfallSkillBot', TELEMETRY_CLIENT, True)

ADAPTER.use(telemetryLoggerMiddleware)

ADAPTER.use(SsoSaveStateMiddleware(CONVERSATION_STATE))

# Create the skill client.
SKILL_CLIENT = SkillHttpClient(CREDENTIAL_PROVIDER, CONVERSATION_ID_FACTORY)

CONTINUATION_PARAMETERS_STORE: Dict[str, ContinuationParameters] = dict()

# Create the main dialog.
DIALOG = ActivityRouterDialog(
    configuration=CONFIG,
    conversation_state=CONVERSATION_STATE,
    conversation_id_factory=CONVERSATION_ID_FACTORY,
    skill_client=SKILL_CLIENT,
    continuation_parameters_store=CONTINUATION_PARAMETERS_STORE
)

# Create the bot that will handle incoming messages.
BOT = SkillBot(CONFIG, CONVERSATION_STATE, DIALOG)
SKILL_HANDLER = SkillHandler(
    ADAPTER, BOT, CONVERSATION_ID_FACTORY, CREDENTIAL_PROVIDER, AUTH_CONFIG
)

# Listen for incoming requests on /api/messages
async def messages(req: Request) -> Response:
    # Main bot message handler.
    TELEMETRY_CLIENT.track_event("WaterfallSkillBot in /api/messages")
    if "application/json" in req.headers["Content-Type"]:
        body = await req.json()
    else:
        return Response(status=HTTPStatus.UNSUPPORTED_MEDIA_TYPE)

    TELEMETRY_CLIENT.track_event("WaterfallSkillBot in messages", {'custom_dimensions':{'activity':json.dumps(body)}})

    activity = Activity().deserialize(body)
    auth_header = req.headers["Authorization"] if "Authorization" in req.headers else ""

    TELEMETRY_CLIENT.track_event("WaterfallSkillBot activity", {'custom_dimensions':{'activity':json.dumps(activity.as_dict())}})

    try:
        website_hostname = os.getenv("WEBSITE_HOSTNAME")
        TELEMETRY_CLIENT.track_event(f"WaterfallSkillBot website_hostname {website_hostname}")
        if website_hostname:
            CONFIG.SERVER_URL = f"https://{website_hostname}"
        else:
            CONFIG.SERVER_URL = f"{req.scheme}://{req.host}"

        TELEMETRY_CLIENT.track_event(f"WaterfallSkillBot CONFIG.SERVER_URL {CONFIG.SERVER_URL}")
        response = await ADAPTER.process_activity(activity, auth_header, BOT.on_turn)
        # DeliveryMode => Expected Replies
        if response:
            TELEMETRY_CLIENT.track_event("WaterfallSkillBot Processed activity with Adapter. response:",
                                         {'custom_dimensions': {'activity': json.dumps(response.body)}})
            return json_response(data=response.body, status=response.status)
        TELEMETRY_CLIENT.track_event(
            "WaterfallSkillBot Processed activity with Adapter. response: Normal delivery mode")
        # DeliveryMode => Normal
        return Response(status=HTTPStatus.CREATED)
    except Exception as exception:
        LOGGER.exception(f"Exception caught on messages: {exception}",
                         extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'WaterfallSkillBot'}})
        raise exception


# Listen for incoming requests on /api/notify
async def notify(req: Request) -> Response:
    error = ""
    user = req.query.get("user")

    continuation_parameters = CONTINUATION_PARAMETERS_STORE.get(user)

    if not continuation_parameters:
        return Response(
            content_type="text/html",
            status=HTTPStatus.OK,
            body=f"<html><body><h1>No messages sent</h1> "
            f"<br/>There are no conversations registered to receive proactive messages for { user }.</body></html>",
        )

    try:

        async def callback(context: TurnContext):
            await context.send_activity(f"Got proactive message for user: { user }")
            await BOT.on_turn(context)

        await ADAPTER.continue_conversation(
            continuation_parameters.conversation_reference,
            callback,
            CONFIG.APP_ID,
            continuation_parameters.claims_identity,
            continuation_parameters.oauth_scope,
        )
    except Exception as err:
        LOGGER.exception(f"Exception caught on notify: {err}",
                         extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'WaterfallSkillBot'}})
        error = err

    return Response(
        content_type="text/html",
        status=HTTPStatus.OK,
        body=f"<html><body><h1>Proactive messages have been sent</h1> "
        f"<br/> Timestamp: { datetime.utcnow() } <br /> Exception: { error }</body></html>",
    )


# Listen for incoming requests on /api/music
async def music(req: Request) -> web.FileResponse:  # pylint: disable=unused-argument
    file_path = os.path.join(os.getcwd(), "dialogs/cards/files/music.mp3")
    return web.FileResponse(file_path)

# @middleware
# async def custom_middleware(request: Request, handler):
#     activity = await request.json()
#     print("hi")
#     LOGGER.warning('RequestMiddleware', extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'WaterfallSkillBot', 'activity': str(activity)}})
#     response = await handler(request)
#     return response

APP = web.Application(middlewares=[aiohttp_error_middleware])
APP.router.add_post("/api/messages", messages)
APP.router.add_routes(aiohttp_channel_service_routes(SKILL_HANDLER, "/api/skills"))

# Simple way of exposing the manifest for dev purposes.
APP.router.add_static("/manifests", "./manifests/")

# Simple way of exposing images folder.
APP.router.add_static("/images", "./images/")

# Listen for incoming requests.
APP.router.add_get("/api/music", music)

# Listen for incoming notifications and send proactive messages to users.
APP.router.add_get("/api/notify", notify)

if __name__ == "__main__":
    try:
        web.run_app(APP, host="localhost", port=CONFIG.PORT)
    except Exception as error:
        LOGGER.exception(f"Error: {error}", extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'WaterfallSkillBot'}})
        raise error
