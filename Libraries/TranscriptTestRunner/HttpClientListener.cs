using System.Net.Http;

namespace TranscriptTestRunner
{
    /// <summary>
    /// .
    /// </summary>
    /// <remarks>
    /// ..
    /// </remarks>
    public class HttpClientListener : HttpClient
    {
        /// <summary>
        /// Initializes a new instance of the <see cref="HttpClientListener"/> class.
        /// </summary>
        /// <param name="handler">.</param>
        /// <param name="disposeHandler">..</param>
        public HttpClientListener(HttpClientHandler handler, bool disposeHandler = false)
            : base(handler, disposeHandler)
        {
            Handler = handler;
        }

        /// <summary>
        /// Gets.
        /// </summary>
        /// <value>
        /// .
        /// </value>
        public HttpClientHandler Handler { get; }
    }
}
