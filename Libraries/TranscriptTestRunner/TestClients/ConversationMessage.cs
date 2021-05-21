using System;
using System.Collections.Generic;
using System.Text;
using Microsoft.Bot.Schema;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace TranscriptTestRunner.TestClients
{
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
#pragma warning disable SA1649 // File name should match first type name
    public class ConversationActivities
#pragma warning restore SA1649 // File name should match first type name
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member
    {
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
        [JsonProperty("activities")]
#pragma warning disable CA2227 // Collection properties should be read only
        public IList<Message> Activities { get; set; }
#pragma warning restore CA2227 // Collection properties should be read only

        [JsonProperty("watermark")]
        public string Watermark { get; set; }
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member
    }

#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
#pragma warning disable SA1402 // File may only contain a single type
    public class Message
#pragma warning restore SA1402 // File may only contain a single type
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member
    {
        [JsonProperty("id")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
        public string Id { get; set; }
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("conversationId")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
        public string ConversationId { get; set; }
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("created")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
        public DateTime Created { get; set; }
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("from")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
        public string From { get; set; }
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("text")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
        public string Text { get; set; }
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("channelData")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
#pragma warning disable CA2227 // Collection properties should be read only
        public JObject ChannelData { get; set; }
#pragma warning restore CA2227 // Collection properties should be read only
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("images")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
#pragma warning disable CA2227 // Collection properties should be read only
        public IList<string> Images { get; set; }
#pragma warning restore CA2227 // Collection properties should be read only
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("attachments")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
#pragma warning disable CA2227 // Collection properties should be read only
        public IList<Attachement> Attachments { get; set; }
#pragma warning restore CA2227 // Collection properties should be read only
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("eTag")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
        public string ETag { get; set; }
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member
    }

#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
#pragma warning disable SA1402 // File may only contain a single type
    public class Attachement
#pragma warning restore SA1402 // File may only contain a single type
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member
    {
        [JsonProperty("url")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
#pragma warning disable CA1056 // Uri properties should not be strings
        public string Url { get; set; }
#pragma warning restore CA1056 // Uri properties should not be strings
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member

        [JsonProperty("contentType")]
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
        public string ContentType { get; set; }
#pragma warning restore CS1591 // Missing XML comment for publicly visible type or member
    }
}
