using System.Net.Http;

namespace TranscriptTestRunner
{
    /// <summary>
    /// .
    /// </summary>
    /// <remarks>
    /// ..
    /// </remarks>
    public class HttpClientInvoker : HttpClient
    {
        /// <summary>
        /// Initializes a new instance of the <see cref="HttpClientInvoker"/> class.
        /// </summary>
        /// <param name="handler">.</param>
        public HttpClientInvoker(HttpClientHandler handler)
            : base(handler, false)
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
