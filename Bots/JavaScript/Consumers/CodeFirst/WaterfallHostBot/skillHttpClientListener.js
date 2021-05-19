const { SkillHttpClient, RoleTypes } = require('botbuilder');
const axios = require('axios');
const { exec } = require("child_process");

const USER_AGENT = `Microsoft-BotFramework/3.1 BotBuilder/`;

class SkillHttpClientListener extends SkillHttpClient {
  constructor(logger, credentialProvider, conversationIdFactory, channelService = '') {
    super(credentialProvider, conversationIdFactory, channelService)
    this.logger = logger;
  }

  async postActivity(fromBotId, toBotId, toUrl, serviceUrl, conversationId, activity) {
    const appCredentials = await this.getAppCredentials(fromBotId, toBotId);
    if (!appCredentials) {
      throw new Error(
        'BotFrameworkHttpClient.postActivity(): Unable to get appCredentials to connect to the skill'
      );
    }

    if (!activity) {
      throw new Error('BotFrameworkHttpClient.postActivity(): missing activity');
    }

    if (activity.conversation === undefined) {
      throw new Error('BotFrameworkHttpClient.postActivity(): Activity must have a ConversationReference');
    }

    // Get token for the skill call
    const token = appCredentials.appId ? await appCredentials.getToken() : null;

    // Capture current activity settings before changing them.
    // TODO: DO we need to set the activity ID? (events that are created manually don't have it).
    const originalConversationId = activity.conversation.id;
    const originalServiceUrl = activity.serviceUrl;
    const originalRelatesTo = activity.relatesTo;
    const originalRecipient = activity.recipient;

    try {
      activity.relatesTo = {
        serviceUrl: activity.serviceUrl,
        activityId: activity.id,
        channelId: activity.channelId,
        conversation: {
          id: activity.conversation.id,
          name: activity.conversation.name,
          conversationType: activity.conversation.conversationType,
          aadObjectId: activity.conversation.aadObjectId,
          isGroup: activity.conversation.isGroup,
          properties: activity.conversation.properties,
          role: activity.conversation.role,
          tenantId: activity.conversation.tenantId,
        },
        bot: null,
      };
      activity.conversation.id = conversationId;
      activity.serviceUrl = serviceUrl;

      // Fixes: https://github.com/microsoft/botframework-sdk/issues/5785
      if (!activity.recipient) {
        activity.recipient = {};
      }
      activity.recipient.role = RoleTypes.Skill;

      const config = {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        validateStatus: () => true,
      };

      if (token) {
        config.headers.Authorization = `Bearer ${ token }`;
      }

      this.logger.trackEvent({
        name: 'JavaScript-postActivity',
        properties: {
          toUrl,
          token,
          activity,
          config,
          appCredentials
        },
      });

      const activityReplaced = JSON.stringify(activity).replace('\u200b', '')
      const activityResult = JSON.parse(activityReplaced)

      // exec("netstat -a -n -o", (error, stdout, stderr) => {
      //   this.logger.trackEvent({
      //     name: 'JavaScript-postActivity-ports',
      //     properties: {
      //       toUrl,
      //       token,
      //       activity,
      //       activityStrigify: JSON.stringify(activity),
      //       activityReplaced,
      //       activityResult,
      //       error,
      //       stderr,
      //       stdout
      //     },
      //   });
      // });

      await axios.get(toUrl.replace('/api/messages', '/api/ping?bot=WaterfallHostBotJS'))

      const response = await axios.post(toUrl, activityResult, config);

      this.logger.trackEvent({
        name: 'JavaScript-postActivity',
        properties: {
          toUrl,
          token,
          activity,
          activityStrigify: JSON.stringify(activity),
          activityReplaced,
          activityResult,
          status: response.status,
          data: response.data,
          config,
          appCredentials
        },
      });

      return { status: response.status, body: response.data };
    } finally {
      // Restore activity properties.
      activity.conversation.id = originalConversationId;
      activity.serviceUrl = originalServiceUrl;
      activity.relatesTo = originalRelatesTo;
      activity.recipient = originalRecipient;
    }
  }
}


module.exports.SkillHttpClientListener = SkillHttpClientListener;
