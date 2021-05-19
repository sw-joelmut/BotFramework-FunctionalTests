# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import json
from typing import Dict

import aiohttp
from botbuilder.core import InvokeResponse
from botbuilder.integration.aiohttp import BotFrameworkHttpClient
from botbuilder.core.skills import (
    ConversationIdFactoryBase,
    SkillConversationIdFactoryOptions,
    BotFrameworkClient,
    BotFrameworkSkill,
)
from botbuilder.schema import (
    Activity,
    ExpectedReplies,
    ConversationReference,
    ConversationAccount,
    ChannelAccount,
    RoleTypes,
)
from botframework.connector.auth import (
    AuthenticationConstants,
    ChannelProvider,
    GovernmentConstants,
    SimpleCredentialProvider,
    MicrosoftAppCredentials,
    AppCredentials,
    MicrosoftGovernmentAppCredentials,
)

from dialogs.telemetry_listener_middleware import AppInsightsClient

class SkillHttpClientListener(BotFrameworkHttpClient):
    def __init__(
        self,
        credential_provider: SimpleCredentialProvider,
        skill_conversation_id_factory: ConversationIdFactoryBase,
        telemetry_client: AppInsightsClient,
        channel_provider: ChannelProvider = None,
    ):
        if not skill_conversation_id_factory:
            raise TypeError(
                "SkillHttpClientListener(): skill_conversation_id_factory can't be None"
            )

        super().__init__(credential_provider)

        self._skill_conversation_id_factory = skill_conversation_id_factory
        self._telemetry_client = telemetry_client
        self._channel_provider = channel_provider

    async def post_activity_to_skill(
        self,
        from_bot_id: str,
        to_skill: BotFrameworkSkill,
        service_url: str,
        activity: Activity,
        originating_audience: str = None,
    ) -> InvokeResponse:

        if originating_audience is None:
            originating_audience = (
                GovernmentConstants.TO_CHANNEL_FROM_BOT_OAUTH_SCOPE
                if self._channel_provider is not None
                and self._channel_provider.is_government()
                else AuthenticationConstants.TO_CHANNEL_FROM_BOT_OAUTH_SCOPE
            )

        options = SkillConversationIdFactoryOptions(
            from_bot_oauth_scope=originating_audience,
            from_bot_id=from_bot_id,
            activity=activity,
            bot_framework_skill=to_skill,
        )

        skill_conversation_id = await self._skill_conversation_id_factory.create_skill_conversation_id(
            options
        )
        self._telemetry_client.track_event(f'Posting activity. ActivityId: {activity.id} from BotId: {from_bot_id}')
        return await self.post_activity(
            from_bot_id,
            to_skill.app_id,
            to_skill.skill_endpoint,
            service_url,
            skill_conversation_id,
            activity,
        )

    async def post_activity(
        self,
        from_bot_id: str,
        to_bot_id: str,
        to_url: str,
        service_url: str,
        conversation_id: str,
        activity: Activity,
    ) -> InvokeResponse:
        app_credentials = await self._get_app_credentials(from_bot_id, to_bot_id)

        if not app_credentials:
            raise KeyError("Unable to get appCredentials to connect to the skill")

        # Get token for the skill call
        token = (
            app_credentials.get_access_token()
            if app_credentials.microsoft_app_id
            else None
        )

        self._telemetry_client.track_event("Init-PostActivity", 
            {'custom_dimensions': {
                'to_url': to_url, 
                'token': token,
                'activity': json.dumps(activity.as_dict(False))
                }
            }
        )

        # Capture current activity settings before changing them.
        original_conversation_id = activity.conversation.id
        original_service_url = activity.service_url
        original_relates_to = activity.relates_to
        original_recipient = activity.recipient

        try:
            activity.relates_to = ConversationReference(
                service_url=activity.service_url,
                activity_id=activity.id,
                channel_id=activity.channel_id,
                conversation=ConversationAccount(
                    id=activity.conversation.id,
                    name=activity.conversation.name,
                    conversation_type=activity.conversation.conversation_type,
                    aad_object_id=activity.conversation.aad_object_id,
                    is_group=activity.conversation.is_group,
                    role=activity.conversation.role,
                    tenant_id=activity.conversation.tenant_id,
                    properties=activity.conversation.properties,
                ),
                bot=None,
            )
            activity.conversation.id = conversation_id
            activity.service_url = service_url
            if not activity.recipient:
                activity.recipient = ChannelAccount(role=RoleTypes.skill)
            else:
                activity.recipient.role = RoleTypes.skill

            self._telemetry_client.track_event("UpdatedActivity-PostActivity", 
                {'custom_dimensions': {
                    'to_url': to_url, 
                    'token': token,
                    'activity': json.dumps(activity.as_dict(False)),
                    'json_content': json.dumps(activity.serialize())
                    }
                }
            )
            status, content = await self._post_content(to_url, token, activity)

            return InvokeResponse(status=status, body=content)

        finally:
            # Restore activity properties.
            activity.conversation.id = original_conversation_id
            activity.service_url = original_service_url
            activity.relates_to = original_relates_to
            activity.recipient = original_recipient

    async def _post_content(
        self, to_url: str, token: str, activity: Activity
    ) -> (int, object):
        headers_dict = {
            "Content-type": "application/json; charset=utf-8",
        }
        if token:
            headers_dict.update(
                {"Authorization": f"Bearer {token}",}
            )

        json_content = json.dumps(activity.serialize())

        await self._session.get(to_url.replace('/api/messages', '/api/ping?bot=WaterfallHostBotPython'))

        resp = await self._session.post(
            to_url, data=json_content.encode("utf-8"), headers=headers_dict,
        )
        resp.raise_for_status()
        data = (await resp.read()).decode()

        self._telemetry_client.track_event("PostContent-PostActivity", 
            {'custom_dimensions': {
                'to_url': to_url, 
                'token': token,
                'activity': json.dumps(activity.as_dict(False)),
                'json_content': json.dumps(activity.serialize()),
                'response_data': (await resp.read()).decode()
                }
            }
        )

        return resp.status, json.loads(data) if data else None
