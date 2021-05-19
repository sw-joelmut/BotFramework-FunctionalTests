// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const dotenv = require('dotenv');
const http = require('http');
const https = require('https');
const path = require('path');
const restify = require('restify');

// Import required bot configuration.
const ENV_FILE = path.join(__dirname, '.env');
dotenv.config({ path: ENV_FILE });

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
const { ActivityTypes, BotFrameworkAdapter, InputHints, MemoryStorage, ConversationState, SkillHttpClient, SkillHandler, ChannelServiceRoutes, TurnContext, MessageFactory } = require('botbuilder');
const { AuthenticationConfiguration, SimpleCredentialProvider } = require('botframework-connector');

const { SkillBot } = require('./bots/skillBot');
const { ActivityRouterDialog } = require('./dialogs/activityRouterDialog');
const { allowedCallersClaimsValidator } = require('./authentication/allowedCallersClaimsValidator');
const { SsoSaveStateMiddleware } = require('./middleware/ssoSaveStateMiddleware');
const { SkillConversationIdFactory } = require('./skillConversationIdFactory');

// Import required services for bot telemetry
const { ApplicationInsightsTelemetryClient, TelemetryInitializerMiddleware } = require('botbuilder-applicationinsights');
const { TelemetryLoggerMiddleware } = require('botbuilder-core');

const applicationInsights = require("applicationinsights");
applicationInsights.setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
  .setAutoCollectDependencies(false)
  .setAutoCollectRequests(false)
  .start();

const client = applicationInsights.defaultClient;
const properties = { Environment: 'JavaScript', Bot: 'WaterfallSkillBot' }

try {
  // Create HTTP server
  const server = restify.createServer({ maxParamLength: 1000 });
  server.use(restify.plugins.queryParser());

  server.listen(process.env.port || process.env.PORT || 36420, () => {
    console.log(`\n${ server.name } listening to ${ server.url }`);
    console.log('\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator');
    console.log('\nTo talk to your bot, open the emulator select "Open Bot"');
  });

  const authConfig = new AuthenticationConfiguration([], allowedCallersClaimsValidator);

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
    authConfig: authConfig,
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
  const telemetryLoggerMiddleware = new TelemetryListenerMiddleware('WaterfallSkillBot', telemetryClient, true);
  const initializerMiddleware = new TelemetryInitializerMiddleware(telemetryLoggerMiddleware, true);
  adapter.use(initializerMiddleware);

  // Catch-all for errors.
  adapter.onTurnError = async (context, error) => {
    // This check writes out errors to console log .vs. app insights.
    // NOTE: In production environment, you should consider logging this to Azure application insights.

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
      const msg = `\n onTurnError Trace : ${ message }\n ${ stack }`
      console.error(msg);
      client.trackException({ exception: new Error(msg), properties });
    } catch (err) {
      const { message, stack } = err;
      const msg = `\n [onTurnError] Exception caught in onTurnError : ${ message }\n ${ stack }`
      console.error(msg);
      client.trackException({ exception: new Error(msg), properties });
    }
  };

  const continuationParametersStore = {};

  // Define the state store for your bot.
  // See https://aka.ms/about-bot-state to learn more about using MemoryStorage.
  // A bot requires a state storage system to persist the dialog and user state between messages.
  const memoryStorage = new MemoryStorage();

  // Create conversation and user state with in-memory storage provider.
  const conversationState = new ConversationState(memoryStorage);

  adapter.use(new SsoSaveStateMiddleware(conversationState));

  // Create the conversationIdFactory
  const conversationIdFactory = new SkillConversationIdFactory();

  // Create the credential provider;
  const credentialProvider = new SimpleCredentialProvider(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);

  // Create the skill client
  const skillClient = new SkillHttpClient(credentialProvider, conversationIdFactory);

  // Create the main dialog.
  const dialog = new ActivityRouterDialog(server.url, conversationState, conversationIdFactory, skillClient, continuationParametersStore);

  // Create the bot that will handle incoming messages.
  const bot = new SkillBot(conversationState, dialog, server.url);

  // Expose the manifest
  server.get('/manifests/*', restify.plugins.serveStatic({ directory: './manifests', appendRequestPath: false }));

  // Expose images
  server.get('/images/*', restify.plugins.serveStatic({ directory: './images', appendRequestPath: false }));

  // Listen for incoming requests.
  server.post('/api/messages', async (req, res) => {
    const request = await parseRequest(req);
    telemetryClient.trackEvent({ name: 'WaterfallSkillBot in /api/messages', properties: { ...properties, activity: request } });
    adapter.processActivity(req, res, async (context) => {
      telemetryClient.trackEvent({ name: 'WaterfallSkillBot in /api/messages processActivity', properties: { ...properties, activity: context.activity } });
      // Route to main dialog.
      await bot.run(context);
    });
  });

  // Create and initialize the skill classes.

  // Workaround for communicating back to the Host without throwing Unauthorized error due to the creation of a new Connector Client in the Adapter when the continueConvesation happens.

  // Uncomment this when resolved.
  // const handler = new SkillHandler(adapter, bot, conversationIdFactory, credentialProvider, authConfig);
  // const skillEndpoint = new ChannelServiceRoutes(handler);
  // skillEndpoint.register(server, '/api/skills');

  // Remove this when resolved
  const handler = new SkillHandler(adapter, bot, conversationIdFactory, credentialProvider, authConfig);
  server.post('/api/skills/v3/conversations/:conversationId/activities/:activityId', async (req, res) => {
    try {
      const request = await parseRequest(req);
      telemetryClient.trackEvent({ name: 'WaterfallSkillBot in /api/skills/v3/conversations', properties: { ...properties, activity: request } });
      const authHeader = req.headers.authorization || req.headers.Authorization || '';
      const activity = await ChannelServiceRoutes.readActivity(req);
      const ref = await handler.conversationIdFactory.getSkillConversationReference(req.params.conversationId);
      const claimsIdentity = await handler.authenticate(authHeader);

      const response = await new Promise(resolve => {
        return adapter.continueConversation(ref.conversationReference, ref.oAuthScope, async (context) => {
          telemetryClient.trackEvent({ name: 'WaterfallSkillBot in /api/skills/v3/conversations adapter.continueConversation', properties: { ...properties, activity: context.activity } });
          context.turnState.set(adapter.BotIdentityKey, claimsIdentity);
          context.turnState.set(adapter.SkillConversationReferenceKey, ref);

          const newActivity = TurnContext.applyConversationReference(activity, ref.conversationReference);

          if (newActivity.type === ActivityTypes.EndOfConversation) {
            await handler.conversationIdFactory.deleteConversationReference(req.params.conversationId);
            SkillHandler.applyEoCToTurnContextActivity(context, newActivity);
            resolve(await bot.run(context));
          }

          telemetryClient.trackEvent({ name: 'WaterfallSkillBot in /api/skills/v3/conversations context.sendActivity', properties: { ...properties, activity: newActivity } });
          resolve(await context.sendActivity(newActivity));
        });
      });

      res.status(200);
      res.send(response);
      res.end();
    } catch (error) {
      const { message, stack } = error;
      const msg = `\n [server.post] Exception caught in '/api/skills/v3/conversations/...' : ${ message }\n ${ stack }`
      console.error(msg);
      client.trackException({ exception: new Error(msg), properties });
      ChannelServiceRoutes.handleError(error, res);
    }
  });

  server.get('/api/ping', (req, res) => {
    const bot = req.query.bot;
    telemetryClient.trackEvent({name:`Ping in WaterfallSkillBotJS from ${ bot }`})
    res.writeHead(200);
    res.end();
  });

  // Listen for incoming requests.
  server.get('/api/music', restify.plugins.serveStatic({ directory: 'dialogs/cards/files', file: 'music.mp3' }));

  // Listen for incoming notifications and send proactive messages to users.
  server.get('/api/notify', async (req, res) => {
    let error;
    const { user } = req.query;

    const continuationParameters = continuationParametersStore[user];

    if (!continuationParameters) {
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.write(`<html><body><h1>No messages sent</h1> <br/>There are no conversations registered to receive proactive messages for ${ user }.</body></html>`);
      res.end();
      return;
    }

    try {
      adapter.continueConversation(continuationParameters.conversationReference, continuationParameters.oAuthScope, async context => {
        await context.sendActivity(`Got proactive message for user: ${ user }`);
        await bot.run(context);
      });
    } catch (err) {
      error = err;
      const { message, stack } = err;
      const msg = `\n [server.get] Exception caught in '/api/notify' : ${ message }\n ${ stack }`;
      console.error(msg);
      client.trackException({ exception: new Error(msg), properties });
    }

    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.write(`<html><body><h1>Proactive messages have been sent</h1> <br/> Timestamp: ${ new Date().toISOString() } <br /> Exception: ${ error || '' }</body></html>`);
    res.end();
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

