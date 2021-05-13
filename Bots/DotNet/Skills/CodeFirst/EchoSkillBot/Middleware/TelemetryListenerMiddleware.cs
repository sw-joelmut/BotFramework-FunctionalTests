using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Bot.Builder;
using Microsoft.Bot.Schema;
using Newtonsoft.Json;

namespace Microsoft.BotFrameworkFunctionalTests.EchoSkillBot.Middleware
{
    public class TelemetryListenerMiddleware : TelemetryLoggerMiddleware
    {
        private readonly string _fromValue;

        public TelemetryListenerMiddleware(IBotTelemetryClient botTelemetryClient, bool logPersonalInformation = false)
            : base(botTelemetryClient, logPersonalInformation)
        {
            _fromValue = "EchoSkillBot";
        }

        protected override async Task OnReceiveActivityAsync(Activity activity, CancellationToken cancellation)
        {
            var customProperties = new Dictionary<string, string>
            {
                { "from", _fromValue },
                { "to", activity.From?.Name },
                { "conversationId", activity.Conversation?.Id },
                { "activityId", activity.Name },
                { "activityText", activity.Text },
                { "activity", JsonConvert.SerializeObject(activity) }
            };

            TelemetryClient.TrackEvent(TelemetryLoggerConstants.BotMsgReceiveEvent, await FillReceiveEventPropertiesAsync(activity, customProperties).ConfigureAwait(false));
            return;
        }

        protected override async Task OnSendActivityAsync(Activity activity, CancellationToken cancellation)
        {
            var customProperties = new Dictionary<string, string>
            {
                { "from", _fromValue },
                { "to", activity.From?.Name },
                { "conversationId", activity.Conversation?.Id },
                { "activiytText", activity.Text },
                { "activityId", activity.Id },
                { "activity", JsonConvert.SerializeObject(activity) }
            };

            TelemetryClient.TrackEvent(TelemetryLoggerConstants.BotMsgSendEvent, await FillReceiveEventPropertiesAsync(activity, customProperties).ConfigureAwait(false));
            return;
        }
    }
}
