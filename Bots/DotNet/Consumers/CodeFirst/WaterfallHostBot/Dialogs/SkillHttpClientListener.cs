using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Bot.Builder;
using Microsoft.Bot.Builder.Dialogs;
using Microsoft.Bot.Builder.Integration.AspNet.Core.Skills;
using Microsoft.Bot.Builder.Skills;
using Microsoft.Bot.Connector.Authentication;
using Microsoft.Bot.Schema;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Activity = Microsoft.Bot.Schema.Activity;

namespace Microsoft.BotFrameworkFunctionalTests.WaterfallHostBot.Dialogs
{
    public class SkillHttpClientListener : SkillHttpClient
    {
        private readonly SkillConversationIdFactoryBase _conversationIdFactory;
        private IBotTelemetryClient _logger;

        public SkillHttpClientListener(HttpClient httpClient, ICredentialProvider credentialProvider, SkillConversationIdFactoryBase conversationIdFactory, IChannelProvider channelProvider = null, ILogger logger = null, IBotTelemetryClient telemetryClient = null)
            : base(httpClient, credentialProvider, conversationIdFactory, channelProvider, logger)
        {
            _logger = telemetryClient;
            _conversationIdFactory = conversationIdFactory;
        }

        public virtual async Task<InvokeResponse<T>> PostActivityAsync<T>(string originatingAudience, string fromBotId, BotFrameworkSkill toSkill, Uri callbackUrl, Activity activity, CancellationToken cancellationToken)
        {
            string skillConversationId;
            try
            {
                var options = new SkillConversationIdFactoryOptions
                {
                    FromBotOAuthScope = originatingAudience,
                    FromBotId = fromBotId,
                    Activity = activity,
                    BotFrameworkSkill = toSkill
                };
                skillConversationId = await _conversationIdFactory.CreateSkillConversationIdAsync(options, cancellationToken).ConfigureAwait(false);
            }
            catch (NotImplementedException)
            {
                skillConversationId = await _conversationIdFactory.CreateSkillConversationIdAsync(activity.GetConversationReference(), cancellationToken).ConfigureAwait(false);
            }

            return await PostActivityAsync<T>(fromBotId, toSkill.AppId, toSkill.SkillEndpoint, callbackUrl, skillConversationId, activity, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Forwards an activity to a skill (bot).
        /// </summary>
        /// <param name="fromBotId">The MicrosoftAppId of the bot sending the activity.</param>
        /// <param name="toSkill">An instance of <see cref="BotFrameworkSkill"/>.</param>
        /// <param name="callbackUrl">The callback Uri.</param>
        /// <param name="activity">activity to forward.</param>
        /// <param name="cancellationToken">cancellation Token.</param>
        /// <returns>Async task with optional invokeResponse.</returns>
        public virtual async Task<InvokeResponse> PostActivityAsync(string fromBotId, BotFrameworkSkill toSkill, Uri callbackUrl, Activity activity, CancellationToken cancellationToken)
        {
            return await PostActivityAsync<object>(fromBotId, toSkill, callbackUrl, activity, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Forwards an activity to a skill (bot).
        /// </summary>
        /// <param name="fromBotId">The MicrosoftAppId of the bot sending the activity.</param>
        /// <param name="toSkill">An instance of <see cref="BotFrameworkSkill"/>.</param>
        /// <param name="callbackUrl">The callback Uri.</param>
        /// <param name="activity">activity to forward.</param>
        /// <param name="cancellationToken">cancellation Token.</param>
        /// <typeparam name="T">type of the <see cref="InvokeResponse"/> result.</typeparam>
        /// <returns>Async task with optional invokeResponse of type T.</returns>
        public virtual async Task<InvokeResponse<T>> PostActivityAsync<T>(string fromBotId, BotFrameworkSkill toSkill, Uri callbackUrl, Activity activity, CancellationToken cancellationToken)
        {
            var originatingAudience = ChannelProvider != null && ChannelProvider.IsGovernment() ? GovernmentAuthenticationConstants.ToChannelFromBotOAuthScope : AuthenticationConstants.ToChannelFromBotOAuthScope;
            return await PostActivityAsync<T>(originatingAudience, fromBotId, toSkill, callbackUrl, activity, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Forwards an activity to a skill (bot).
        /// </summary>
        /// <remarks>NOTE: Forwarding an activity to a skill will flush UserState and ConversationState changes so that skill has accurate state.</remarks>
        /// <param name="fromBotId">The MicrosoftAppId of the bot sending the activity.</param>
        /// <param name="toBotId">The MicrosoftAppId of the bot receiving the activity.</param>
        /// <param name="toUrl">The URL of the bot receiving the activity.</param>
        /// <param name="serviceUrl">The callback Url for the skill host.</param>
        /// <param name="conversationId">A conversation ID to use for the conversation with the skill.</param>
        /// <param name="activity">activity to forward.</param>
        /// <param name="cancellationToken">cancellation Token.</param>
        /// <returns>Async task with optional invokeResponse.</returns>
        public override async Task<InvokeResponse> PostActivityAsync(string fromBotId, string toBotId, Uri toUrl, Uri serviceUrl, string conversationId, Activity activity, CancellationToken cancellationToken = default)
        {
            return await PostActivityAsync<object>(fromBotId, toBotId, toUrl, serviceUrl, conversationId, activity, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Forwards an activity to a skill (bot).
        /// </summary>
        /// <remarks>NOTE: Forwarding an activity to a skill will flush UserState and ConversationState changes so that skill has accurate state.</remarks>
        /// <typeparam name="T">The type of body in the InvokeResponse.</typeparam>
        /// <param name="fromBotId">The MicrosoftAppId of the bot sending the activity.</param>
        /// <param name="toBotId">The MicrosoftAppId of the bot receiving the activity.</param>
        /// <param name="toUrl">The URL of the bot receiving the activity.</param>
        /// <param name="serviceUrl">The callback Url for the skill host.</param>
        /// <param name="conversationId">A conversation ID to use for the conversation with the skill.</param>
        /// <param name="activity">activity to forward.</param>
        /// <param name="cancellationToken">cancellation Token.</param>
        /// <returns>Async task with optional invokeResponse<typeparamref name="T"/>.</returns>
        public override async Task<InvokeResponse<T>> PostActivityAsync<T>(string fromBotId, string toBotId, Uri toUrl, Uri serviceUrl, string conversationId, Activity activity, CancellationToken cancellationToken = default)
        {
            var appCredentials = await GetAppCredentialsAsync(fromBotId, toBotId).ConfigureAwait(false);
            if (appCredentials == null)
            {
                Logger.LogError("Unable to get appCredentials to connect to the skill");
                throw new InvalidOperationException("Unable to get appCredentials to connect to the skill");
            }

            // Get token for the skill call
            var token = appCredentials == MicrosoftAppCredentials.Empty ? null : await appCredentials.GetTokenAsync().ConfigureAwait(false);

            // Clone the activity so we can modify it before sending without impacting the original object.
            var activityClone = JsonConvert.DeserializeObject<Activity>(JsonConvert.SerializeObject(activity));
            activityClone.RelatesTo = new ConversationReference
            {
                ServiceUrl = activityClone.ServiceUrl,
                ActivityId = activityClone.Id,
                ChannelId = activityClone.ChannelId,
                Locale = activityClone.Locale,
                Conversation = new ConversationAccount
                {
                    Id = activityClone.Conversation.Id,
                    Name = activityClone.Conversation.Name,
                    ConversationType = activityClone.Conversation.ConversationType,
                    AadObjectId = activityClone.Conversation.AadObjectId,
                    IsGroup = activityClone.Conversation.IsGroup,
                    Properties = activityClone.Conversation.Properties,
                    Role = activityClone.Conversation.Role,
                    TenantId = activityClone.Conversation.TenantId,
                }
            };
            activityClone.Conversation.Id = conversationId;
            activityClone.ServiceUrl = serviceUrl.ToString();
            activityClone.Recipient ??= new ChannelAccount();
            activityClone.Recipient.Role = RoleTypes.Skill;

            return await SecurePostActivityAsync<T>(toUrl, activityClone, token, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Post Activity to the bot using the bot's credentials.
        /// </summary>
        /// <param name="botId">The MicrosoftAppId of the bot.</param>
        /// <param name="botEndpoint">The URL of the bot.</param>
        /// <param name="activity">activity to post.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>InvokeResponse.</returns>
        public virtual async Task<InvokeResponse> PostActivityAsync(string botId, Uri botEndpoint, Activity activity, CancellationToken cancellationToken = default)
        {
            return await PostActivityAsync<object>(botId, botEndpoint, activity, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Post Activity to the bot using the bot's credentials.
        /// </summary>
        /// <typeparam name="T">type of invokeResponse body.</typeparam>
        /// <param name="botId">The MicrosoftAppId of the bot.</param>
        /// <param name="botEndpoint">The URL of the bot.</param>
        /// <param name="activity">activity to post.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>InvokeResponse<typeparamref name="T"/>.</returns>
        public virtual async Task<InvokeResponse<T>> PostActivityAsync<T>(string botId, Uri botEndpoint, Activity activity, CancellationToken cancellationToken = default)
        {
            // From BotId => BotId
            var appCredentials = await GetAppCredentialsAsync(botId, botId).ConfigureAwait(false);
            if (appCredentials == null)
            {
                throw new InvalidOperationException($"Unable to get appCredentials for the bot Id={botId}");
            }

            // Get token for the bot to call itself
            var token = appCredentials == MicrosoftAppCredentials.Empty ? null : await appCredentials.GetTokenAsync().ConfigureAwait(false);

            // post the activity to the url using the bot's credentials.
            Logger.LogInformation($"Posting activity. ActivityId: {activity.Id} from BotId: {botId}");
            return await SecurePostActivityAsync<T>(botEndpoint, activity, token, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Logic to build an <see cref="AppCredentials"/> object to be used to acquire tokens
        /// for this HttpClient.
        /// </summary>
        /// <param name="appId">The application id.</param>
        /// <param name="oAuthScope">The optional OAuth scope.</param>
        /// <returns>The app credentials to be used to acquire tokens.</returns>
        protected virtual async Task<AppCredentials> BuildCredentialsAsync(string appId, string oAuthScope = null)
        {
            var appPassword = await CredentialProvider.GetAppPasswordAsync(appId).ConfigureAwait(false);
            return ChannelProvider != null && ChannelProvider.IsGovernment() ? new MicrosoftGovernmentAppCredentials(appId, appPassword, HttpClient, Logger, oAuthScope) : new MicrosoftAppCredentials(appId, appPassword, HttpClient, Logger, oAuthScope);
        }

        private static T GetBodyContent<T>(string content)
        {
            try
            {
                return JsonConvert.DeserializeObject<T>(content);
            }
            catch (JsonException)
            {
                // This will only happen when the skill didn't return valid json in the content (e.g. when the status code is 500 or there's a bug in the skill)
                return default;
            }
        }

        private async Task<InvokeResponse<T>> SecurePostActivityAsync<T>(Uri toUrl, Activity activity, string token, CancellationToken cancellationToken)
        {
            _logger.TrackEvent("Init-SecurePostActivityAsync", new Dictionary<string, string>
            {
                { "toUrl", JsonConvert.SerializeObject(toUrl) },
                { "token", token },
                { "activity", JsonConvert.SerializeObject(activity) }
            });

            using (var jsonContent = new StringContent(JsonConvert.SerializeObject(activity, new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore }), Encoding.UTF8, "application/json"))
            {
                _logger.TrackEvent("Json-SecurePostActivityAsync", new Dictionary<string, string>
                {
                    { "toUrl", JsonConvert.SerializeObject(toUrl) },
                    { "token", token },
                    { "activity", JsonConvert.SerializeObject(activity) },
                    { "jsonContent", JsonConvert.SerializeObject(jsonContent) }
                });

                using (var httpRequestMessage = new HttpRequestMessage())
                {
                    httpRequestMessage.Method = HttpMethod.Post;
                    httpRequestMessage.RequestUri = toUrl;
                    if (token != null)
                    {
                        httpRequestMessage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    }

                    httpRequestMessage.Content = jsonContent;

                    // // Start the child process.
                    // Process p = new Process();

                    // // Redirect the output stream of the child process.
                    // p.StartInfo.UseShellExecute = false;
                    // p.StartInfo.RedirectStandardOutput = true;
                    // p.StartInfo.FileName = "powershell.exe";
                    // p.StartInfo.Arguments = "netstat -a -n -o";
                    // p.Start();

                    // // Read the output stream first and then wait.
                    // string output = p.StandardOutput.ReadToEnd();
                    // p.WaitForExit();

                    // _logger.TrackEvent("Ports-SecurePostActivityAsync", new Dictionary<string, string>
                    //     {
                    //         { "ports", output },
                    //         { "token", token },
                    //         { "activity", JsonConvert.SerializeObject(activity) },
                    //         { "jsonContent", JsonConvert.SerializeObject(jsonContent) },
                    //         { "httpRequestMessage",  JsonConvert.SerializeObject(httpRequestMessage) },
                    //     });

                    await HttpClient.GetAsync(toUrl.ToString().Replace(toUrl.PathAndQuery, "/api/ping?bot=WaterfallHostBotDotNet"));

                    using (var response = await HttpClient.SendAsync(httpRequestMessage, cancellationToken).ConfigureAwait(false))
                    {
                        var responseContentAsync = string.Empty;
                        var isContentNotNull = response.Content != null;
                        if (isContentNotNull)
                        {
                            responseContentAsync = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                        }

                        var content = isContentNotNull ? responseContentAsync : null;

                        _logger.TrackEvent("HttpClient.SendAsync-SecurePostActivityAsync", new Dictionary<string, string>
                        {
                            { "toUrl", JsonConvert.SerializeObject(toUrl) },
                            { "token", token },
                            { "activity", JsonConvert.SerializeObject(activity) },
                            { "jsonContent", JsonConvert.SerializeObject(jsonContent) },
                            { "httpRequestMessage",  JsonConvert.SerializeObject(httpRequestMessage) },
                            { "content", content },
                            { "responseContent",  JsonConvert.SerializeObject(response.Content) },
                            { "isContentNotNull",  isContentNotNull.ToString() },
                            { "responseContentAsync", responseContentAsync }
                        });

                        return new InvokeResponse<T>
                        {
                            Status = (int)response.StatusCode,
                            Body = content?.Length > 0 ? GetBodyContent<T>(content) : default
                        };
                    }
                }
            }
        }

        /// <summary>
        /// Gets the application credentials. App Credentials are cached so as to ensure we are not refreshing
        /// token every time.
        /// </summary>
        /// <param name="appId">The application identifier (AAD Id for the bot).</param>
        /// <param name="oAuthScope">The scope for the token, skills will use the Skill App Id. </param>
        /// <returns>App credentials.</returns>
        private async Task<AppCredentials> GetAppCredentialsAsync(string appId, string oAuthScope = null)
        {
            if (string.IsNullOrWhiteSpace(appId))
            {
                return MicrosoftAppCredentials.Empty;
            }

            // If the credentials are in the cache, retrieve them from there
            var cacheKey = $"{appId}{oAuthScope}";
            if (AppCredentialMapCache.TryGetValue(cacheKey, out var appCredentials))
            {
                return appCredentials;
            }

            // Credentials not found in cache, build them
            appCredentials = await BuildCredentialsAsync(appId, oAuthScope).ConfigureAwait(false);

            // Cache the credentials for later use
            AppCredentialMapCache[cacheKey] = appCredentials;
            return appCredentials;
        }
    }
}
