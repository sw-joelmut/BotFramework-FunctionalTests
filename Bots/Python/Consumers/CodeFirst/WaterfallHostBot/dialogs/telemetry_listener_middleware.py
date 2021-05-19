import json
from typing import Dict

from botbuilder.schema import Activity
from botbuilder.core.bot_telemetry_client import BotTelemetryClient

from botbuilder.core.telemetry_logger_constants import TelemetryLoggerConstants
from botbuilder.core.telemetry_logger_middleware import TelemetryLoggerMiddleware

import logging

class TelemetryListenerMiddleware(TelemetryLoggerMiddleware):
    def __init__(
        self, bot: str, telemetry_client: BotTelemetryClient, log_personal_information: bool
    ) -> None:
        super().__init__(telemetry_client, log_personal_information)
        self._from = bot
        self._telemetry_client = telemetry_client
        self._log_personal_information = log_personal_information

    async def on_receive_activity(self, activity: Activity) -> None:
        self._telemetry_client.track_event(
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
        self._telemetry_client.track_event(
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

class AppInsightsClient():
    def __init__(
        self,
        logger
    ):
        self._logger = logger
        self._logger.setLevel(logging.INFO)

    def track_event(
        self,
        name: str,
        properties: Dict[str, object] = None
    ) -> None:
        self._logger.info(msg=name, extra=properties)