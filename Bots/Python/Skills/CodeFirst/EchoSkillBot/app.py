# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import json
import sys
import traceback
from datetime import datetime
from typing import Dict

from aiohttp import web
from aiohttp.web import Request, Response
from botbuilder.core.bot_telemetry_client import BotTelemetryClient
from botbuilder.core import (
    BotFrameworkAdapter,
    BotFrameworkAdapterSettings,
    TurnContext,
    MessageFactory,
)
from botbuilder.core.telemetry_logger_constants import TelemetryLoggerConstants
from botbuilder.core.telemetry_logger_middleware import TelemetryLoggerMiddleware
from botbuilder.schema import Activity, ActivityTypes, InputHints
from botframework.connector.auth import AuthenticationConfiguration

from bots import EchoBot
from config import DefaultConfig
from authentication import AllowedCallersClaimsValidator
from http import HTTPStatus

import logging
from opencensus.ext.azure.log_exporter import AzureEventHandler, AzureLogHandler

CONFIG = DefaultConfig()
CLAIMS_VALIDATOR = AllowedCallersClaimsValidator(frozenset(CONFIG.ALLOWED_CALLERS))
AUTH_CONFIG = AuthenticationConfiguration(
    claims_validator=CLAIMS_VALIDATOR.validate_claims
)
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
PROPERTIES = {'custom_dimensions': {'Environment': 'Python', 'Bot': 'EchoSkillBot'}}

ADAPTER = BotFrameworkAdapter(SETTINGS)

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

telemetryLoggerMiddleware = TelemetryListenerMiddleware('EchoSkillBot', TELEMETRY_CLIENT, True)

ADAPTER.use(telemetryLoggerMiddleware)

# Catch-all for errors.
async def on_error(context: TurnContext, error: Exception):
    # This check writes out errors to console log .vs. app insights.
    # NOTE: In production environment, you should consider logging this to Azure
    #       application insights.
    print(f"\n [on_turn_error] unhandled error: {error}", file=sys.stderr)
    traceback.print_exc()
    LOGGER.exception(f"\n [on_turn_error] unhandled error: {error}", extra=PROPERTIES)
    try:
        exc_info = sys.exc_info()
        stack = traceback.format_exception(*exc_info)

        # Send a message to the user
        error_message_text = "The skill encountered an error or bug."
        error_message = MessageFactory.text(
            f"{error_message_text}\r\n{error}\r\n{stack}",
            error_message_text,
            InputHints.ignoring_input,
        )
        error_message.value = {"message": error, "stack": stack}
        await context.send_activity(error_message)

        error_message_text = (
            "To continue to run this bot, please fix the bot source code."
        )
        error_message = MessageFactory.text(
            error_message_text, error_message_text, InputHints.expecting_input
        )
        await context.send_activity(error_message)

        LOGGER.exception(f"\n Exception: {error}", extra=PROPERTIES)
        # Send a trace activity, which will be displayed in Bot Framework Emulator
        if context.activity.channel_id == "emulator":
            # Create a trace activity that contains the error object
            trace_activity = Activity(
                label="TurnError",
                name="on_turn_error Trace",
                timestamp=datetime.utcnow(),
                type=ActivityTypes.trace,
                value=f"{error}",
                value_type="https://www.botframework.com/schemas/error",
            )
            await context.send_activity(trace_activity)

        # Send and EndOfConversation activity to the skill caller with the error to end the conversation and let the
        # caller decide what to do. Send a trace activity if we're talking to the Bot Framework Emulator
        end_of_conversation = Activity(
            type=ActivityTypes.end_of_conversation, code="SkillError", text=f"{error}"
        )
        await context.send_activity(end_of_conversation)
    except Exception as exception:
        print(
            f"\n Exception caught on on_error : {exception}", file=sys.stderr,
        )
        traceback.print_exc()
        LOGGER.exception(f"\n Exception caught on on_error : {exception}", extra=PROPERTIES)

ADAPTER.on_turn_error = on_error

# Create Bot
BOT = EchoBot()

# Listen for incoming requests on /api/messages
async def messages(req: Request) -> Response:
    # Main bot message handler.
    TELEMETRY_CLIENT.track_event("EchoSkillBot in /api/messages")
    if "application/json" in req.headers["Content-Type"]:
        body = await req.json()
    else:
        return Response(status=HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
    TELEMETRY_CLIENT.track_event("EchoSkillBot in messages", {'custom_dimensions': {'activity': json.dumps(body)}})

    activity = Activity().deserialize(body)
    auth_header = req.headers["Authorization"] if "Authorization" in req.headers else ""

    TELEMETRY_CLIENT.track_event("EchoSkillBot activity",
                                 {'custom_dimensions': {'activity': json.dumps(activity.as_dict())}})
    try:
        response = await ADAPTER.process_activity(activity, auth_header, BOT.on_turn)
        # DeliveryMode => Expected Replies
        if response:
            TELEMETRY_CLIENT.track_event("EchoSkillBot Processed activity with Adapter. response:",
                                         {'custom_dimensions': {'activity': json.dumps(response.body)}})
            body = json.dumps(response.body)
            return Response(status=response.status, body=body)
        TELEMETRY_CLIENT.track_event(
            "EchoSkillBot Processed activity with Adapter. response: Normal delivery mode")
        # DeliveryMode => Normal
        return Response(status=HTTPStatus.CREATED)
    except Exception as exception:
        LOGGER.exception(f"\n Exception caught on messages : {exception}", extra=PROPERTIES)
        raise exception

# @middleware
# async def custom_middleware(request: Request, handler):
#     activity = await request.json()
#     LOGGER.warning('RequestMiddleware', extra={'custom_dimensions': {'Environment': 'Python', 'Bot': 'EchoSkillBot', 'activity': str(activity)}})
#     response = await handler(request)
#     return response

APP = web.Application()
APP.router.add_post("/api/messages", messages)

# simple way of exposing the manifest for dev purposes.
APP.router.add_static("/manifests", "./manifests/")


if __name__ == "__main__":
    try:
        web.run_app(APP, host="localhost", port=CONFIG.PORT)
    except Exception as error:
        LOGGER.exception(f"Error: {error}", extra=PROPERTIES)
        raise error
