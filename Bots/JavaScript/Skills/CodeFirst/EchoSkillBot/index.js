// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const dotenv = require('dotenv');
const http = require('http');
const https = require('https');
const path = require('path');
const restify = require('restify');

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
const { ActivityTypes, BotFrameworkAdapter, InputHints, MessageFactory } = require('botbuilder');
const { AuthenticationConfiguration } = require('botframework-connector');

// Import required bot configuration.
const ENV_FILE = path.join(__dirname, '.env');
dotenv.config({ path: ENV_FILE });

// This bot's main dialog.
const { EchoBot } = require('./bot');
const { allowedCallersClaimsValidator } = require('./authentication/allowedCallersClaimsValidator');

// Import required services for bot telemetry
const { ApplicationInsightsTelemetryClient, TelemetryInitializerMiddleware } = require('botbuilder-applicationinsights');
const { TelemetryLoggerMiddleware } = require('botbuilder-core');

const applicationInsights = require("applicationinsights");
applicationInsights.setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
  .setAutoCollectDependencies(false)
  .setAutoCollectRequests(false)
  .start();

const client = applicationInsights.defaultClient;
const properties = { Environment: 'JavaScript', Bot: 'EchoSkillBot' }

try {
  // Create HTTP server
  const server = restify.createServer();
  server.listen(process.env.port || process.env.PORT || 36400, () => {
    console.log(`\n${ server.name } listening to ${ server.url }`);
    console.log('\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator');
    console.log('\nTo talk to your bot, open the emulator select "Open Bot"');
  });

  // Expose the manifest
  server.get('/manifests/*', restify.plugins.serveStatic({ directory: './manifests', appendRequestPath: false }));


  const maxTotalSockets = (preallocatedSnatPorts, procCount = 1, weight = 0.5, overcommit = 1.1) =>
    Math.min(
      Math.floor((preallocatedSnatPorts / procCount) * weight * overcommit),
      preallocatedSnatPorts
    );

  // Create adapter.
  // See https://aka.ms/about-bot-adapter to learn more about how bots work.
  const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    authConfig: new AuthenticationConfiguration([], allowedCallersClaimsValidator),
    clientOptions: {
      agentSettings: {
        http: new http.Agent({
          keepAlive: true,
          maxTotalSockets: maxTotalSockets(1024, 4, 0.3)
        }),
        https: new https.Agent({
          keepAlive: true,
          maxTotalSockets: maxTotalSockets(1024, 4, 0.7)
        })
      }
    }
  });

  class TelemetryListenerMiddleware extends TelemetryLoggerMiddleware {
    constructor(bot, telemetryClient, logPersonalInformation) {
      super(telemetryClient, logPersonalInformation)
      this.from = bot;
    }

    onSendActivity(activity) {
      this.telemetryClient.trackEvent({
        name: TelemetryLoggerMiddleware.botMsgSendEvent,
        properties: {
          from: this.from,
          to: activity && activity.from ? activity.from.name : '',
          conversationId: activity && activity.conversation ? activity.conversation.id : '',
          activityId: activity ? activity.id : '',
          activityText: activity ? activity.text : '',
          activity
        },
      });
    }

    onReceiveActivity(activity) {
      this.telemetryClient.trackEvent({
        name: TelemetryLoggerMiddleware.botMsgReceiveEvent,
        properties: {
          from: this.from,
          to: activity && activity.from ? activity.from.name : '',
          conversationId: activity && activity.conversation ? activity.conversation.id : '',
          activityId: activity ? activity.id : '',
          activityText: activity ? activity.text : '',
          activity
        },
      });
    }
  }

  // Add telemetry middleware to the adapter middleware pipeline
  const telemetryClient = process.env.APPINSIGHTS_INSTRUMENTATIONKEY ? new ApplicationInsightsTelemetryClient(process.env.APPINSIGHTS_INSTRUMENTATIONKEY) : new NullTelemetryClient();
  const telemetryLoggerMiddleware = new TelemetryListenerMiddleware('EchoSkillBot', telemetryClient, true);
  const initializerMiddleware = new TelemetryInitializerMiddleware(telemetryLoggerMiddleware, true);
  adapter.use(initializerMiddleware);

  // Catch-all for errors.
  adapter.onTurnError = async (context, error) => {
    // This check writes out errors to console log .vs. app insights.
    // NOTE: In production environment, you should consider logging this to Azure
    //       application insights.
    const { message, stack } = error;
    const msg = `\n [onTurnError] unhandled error: ${ message }\n ${ stack }`
    console.error(msg);
    client.trackException({ exception: new Error(msg), properties });

    try {
      // Send a message to the user.
      let errorMessageText = 'The skill encountered an error or bug.';
      let errorMessage = MessageFactory.text(`${ errorMessageText }\r\n${ message }\r\n${ stack }`, errorMessageText, InputHints.IgnoringInput);
      errorMessage.value = { message, stack };
      await context.sendActivity(errorMessage);

      errorMessageText = 'To continue to run this bot, please fix the bot source code.';
      errorMessage = MessageFactory.text(errorMessageText, errorMessageText, InputHints.ExpectingInput);
      await context.sendActivity(errorMessage);

      // Send a trace activity, which will be displayed in Bot Framework Emulator
      await context.sendTraceActivity(
        'OnTurnError Trace',
        `${ error }`,
        'https://www.botframework.com/schemas/error',
        'TurnError'
      );

      // Send and EndOfConversation activity to the skill caller with the error to end the conversation
      // and let the caller decide what to do.
      await context.sendActivity({
        type: ActivityTypes.EndOfConversation,
        code: 'SkillError',
        text: error
      });
    } catch (err) {
      const { message, stack } = err;
      const msg = `\n [onTurnError] Exception caught in onTurnError : ${ message }\n ${ stack }`
      console.error(msg);
      client.trackException({ exception: new Error(msg), properties });
    }
  };

  // Create the bot that will handle incoming messages.
  const myBot = new EchoBot();

  // Listen for incoming requests.
  server.post('/api/messages', async (req, res) => {
    const request = await parseRequest(req);
    telemetryClient.trackEvent({ name: 'EchoSkillBot in /api/messages', properties: { ...properties, activity: request } });
    adapter.processActivity(req, res, async (context) => {
      telemetryClient.trackEvent({ name: 'EchoSkillBot in /api/messages processActivity', properties: { ...properties, activity: context.activity } });
      // Route to main dialog.
      await myBot.run(context);
    });
  });

  function parseRequest(req) {
    return new Promise((resolve, reject) => {
      if (req.body) {
        try {
          resolve(req.body);
        } catch (err) {
          reject(err);
        }
      } else {
        let requestData = '';
        req.on('data', (chunk) => {
          requestData += chunk;
        });
        req.on('end', () => {
          try {
            req.body = JSON.parse(requestData);
            resolve(req.body);
          } catch (err) {
            reject(err);
          }
        });
      }
    });
  }

  // server.use(async (req, res, next) => {
  //   const request = await parseRequest(req);
  //   client.trackEvent({ name: 'RequestMiddleware', properties: { ...properties, activity: request } })
  //   next()
  // })
} catch (error) {
  const { message, stack } = error;
  console.error(`${ message }\n ${ stack }`);
  client.trackException({ exception: error, properties });
}
