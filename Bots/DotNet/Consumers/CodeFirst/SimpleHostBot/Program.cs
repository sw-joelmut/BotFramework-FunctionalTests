// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.ApplicationInsights;

namespace Microsoft.BotFrameworkFunctionalTests.SimpleHostBot
{
    public class Program
    {
        /// <summary>
        /// The entry point of the application.
        /// </summary>
        /// <param name="args">The command line args.</param>
        public static void Main(string[] args)
        {
            var configuration = new ConfigurationBuilder()
                .AddJsonFile("appsettings.json", optional: false)
                .Build();

            var host = CreateHostBuilder(args, configuration).Build();

            var logger = host.Services.GetRequiredService<ILogger<Program>>();
            logger.LogError("AZURE ERROR TEST PROGRAM");

            host.Run();
        }

        /// <summary>
        /// Creates a new instance of the <see cref="HostBuilder"/> class with pre-configured defaults.
        /// </summary>
        /// <param name="args">The command line args.</param>
        /// <param name="configuration">The configuration properties.</param>
        /// <returns>The initialized <see cref="IHostBuilder"/>.</returns>
        public static IHostBuilder CreateHostBuilder(string[] args, IConfiguration configuration) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<Startup>()
                    .ConfigureLogging(
                        builder =>
                        {
                            builder.AddApplicationInsights(configuration["APPINSIGHTS_INSTRUMENTATIONKEY"]);
                            builder.AddFilter<ApplicationInsightsLoggerProvider>(string.Empty, LogLevel.Trace);
                            builder.AddFilter<ApplicationInsightsLoggerProvider>(typeof(Program).FullName, LogLevel.Trace);
                        });
                });
    }
}
