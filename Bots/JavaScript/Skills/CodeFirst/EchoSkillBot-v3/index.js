// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const restify = require('restify');
const builder = require('botbuilder');
require('dotenv').config();

const applicationInsights = require("applicationinsights");
applicationInsights.setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
  .setAutoCollectDependencies(false)
  .setAutoCollectRequests(false)

const client = applicationInsights.defaultClient;
const properties = { Environment: 'JavaScript', Bot: 'EchoSkillBotV3' }

try {
  // Setup Restify Server
  const server = restify.createServer();
  server.listen(process.env.port || process.env.PORT || 36407, function () {
    console.log('%s listening to %s', server.name, server.url);
  });

  // Expose the manifest
  server.get('/manifests/*', restify.plugins.serveStatic({ directory: './manifests', appendRequestPath: false }));

  // Bot Storage: Here we register the state storage for your bot.
  // Default store: volatile in-memory store - Only for prototyping!
  // We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
  // For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
  const inMemoryStorage = new builder.MemoryBotStorage();

  // Create chat connector for communicating with the Bot Framework Service
  const connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    enableSkills: true,
    allowedCallers: [process.env.allowedCallers]
  });

  // Listen for messages from users
  server.post('/api/messages', connector.listen());

  // Create your bot with a function to receive messages from the user
  new builder.UniversalBot(connector, function (session) {
    session.on('error', function (error) {
      const { message, stack } = error;
      const msg = `\n [onTurnError] unhandled error: ${ message }\n ${ stack }`
      console.error(msg);
      client.trackException({ exception: new Error(msg), properties });
      try {
        // Send a message to the user.
        let errorMessageText = 'The skill encountered an error or bug.';
        let activity = new builder.Message()
          .text(`${ errorMessageText }\r\n${ message }\r\n${ stack }`)
          .speak(errorMessageText)
          .inputHint(builder.InputHint.ignoringInput)
          .value({ message, stack });
        session.send(activity);

        errorMessageText = 'To continue to run this bot, please fix the bot source code.';
        activity = new builder.Message()
          .text(errorMessageText)
          .speak(errorMessageText)
          .inputHint(builder.InputHint.expectingInput);
        session.send(activity);

        activity = new builder.Message()
          .code('SkillError')
          .text(message);
        session.endConversation(activity);
      } catch (err) {
        const { message, stack } = err;
        const msg = `\n [onTurnError] Exception caught in onTurnError : ${ message }\n ${ stack }`
        console.error(msg);
        client.trackException({ exception: new Error(msg), properties });
      }
    });

    switch (session.message.text.toLowerCase()) {
      case 'end':
      case 'stop':
        session.say('Ending conversation from the skill...', {
          inputHint: builder.InputHint.acceptingInput
        });
        session.endConversation();
        break;
      default:
        session.say('Echo: ' + session.message.text, {
          inputHint: builder.InputHint.acceptingInput
        });
        session.say('Say "end" or "stop" and I\'ll end the conversation and back to the parent.');
    }
  }).set('storage', inMemoryStorage); // Register in memory storage

  
  // function parseRequest(req) {
  //   return new Promise((resolve, reject) => {
  //     if (req.body) {
  //       try {
  //         resolve(req.body);
  //       } catch (err) {
  //         reject(err);
  //       }
  //     } else {
  //       let requestData = '';
  //       req.on('data', (chunk) => {
  //         requestData += chunk;
  //       });
  //       req.on('end', () => {
  //         try {
  //           req.body = JSON.parse(requestData);
  //           resolve(req.body);
  //         } catch (err) {
  //           reject(err);
  //         }
  //       });
  //     }
  //   });
  // }

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
