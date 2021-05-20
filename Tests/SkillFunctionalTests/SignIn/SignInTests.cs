// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Bot.Connector;
using Microsoft.Bot.Schema;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using SkillFunctionalTests.Common;
using TranscriptTestRunner;
using TranscriptTestRunner.XUnit;
using Xunit;
using Xunit.Abstractions;

namespace SkillFunctionalTests.SignIn
{
    [Trait("TestCategory", "SignIn")]
    public class SignInTests : ScriptTestBase, IClassFixture<TestFixture>
    {
        private readonly string _testScriptsFolder = Directory.GetCurrentDirectory() + @"/SignIn/TestScripts";
        private readonly TestFixture _testFixture;

        public SignInTests(ITestOutputHelper output, TestFixture testFixture)
            : base(output)
        {
            _testFixture = testFixture;
        }

        public static IEnumerable<object[]> TestCases()
        {
            var channelIds = new List<string> { Channels.Directline };
            var deliverModes = new List<string>
            {
                DeliveryModes.Normal,
                DeliveryModes.ExpectReplies,
            };

            var hostBots = new List<HostBot>
            {
                HostBot.WaterfallHostBotDotNet,
                HostBot.WaterfallHostBotJS,
                HostBot.WaterfallHostBotPython,

                // TODO: Enable this when the port to composer is ready
                //HostBot.ComposerHostBotDotNet
            };

            var targetSkills = new List<string>
            {
                SkillBotNames.WaterfallSkillBotDotNet,
                SkillBotNames.WaterfallSkillBotJS,
                SkillBotNames.WaterfallSkillBotPython,
                
                // TODO: Enable this when the port to composer is ready
                //SkillBotNames.ComposerSkillBotDotNet
            };

            var scripts = new List<string>
            {
                "SignIn1.json"
            };

            var testCaseBuilder = new TestCaseBuilder();

            var testCases = testCaseBuilder.BuildTestCases(channelIds, deliverModes, hostBots, targetSkills, scripts);
            foreach (var testCase in testCases)
            {
                yield return testCase;
            }
        }

        [Theory]
        [MemberData(nameof(TestCases))]
        public async Task RunTestCases(TestCaseDataObject testData)
        {
            var signInUrl = string.Empty;
            var testCase = testData.GetObject<TestCase>();
            Logger.LogInformation(JsonConvert.SerializeObject(testCase, Formatting.Indented));

            var options = TestClientOptions[testCase.HostBot];
            var runner = new XUnitTestRunner(new TestClientFactory(testCase.ChannelId, options, Logger).GetTestClient(), TestRequestTimeout, Logger);

            var testParams = new Dictionary<string, string>
            {
                { "DeliveryMode", testCase.DeliveryMode },
                { "TargetSkill", testCase.TargetSkill }
            };

            // Execute the first part of the conversation.
            await runner.RunTestAsync(Path.Combine(_testScriptsFolder, testCase.Script), testParams);

            await runner.AssertReplyAsync(activity =>
            {
                Assert.Equal(ActivityTypes.Message, activity.Type);
                Assert.True(activity.Attachments.Count > 0);

                var card = JsonConvert.DeserializeObject<SigninCard>(JsonConvert.SerializeObject(activity.Attachments.FirstOrDefault().Content));
                signInUrl = card.Buttons[0].Value?.ToString();

                Assert.False(string.IsNullOrEmpty(signInUrl));
            });

            // Execute the SignIn.
            await runner.ClientSignInAsync(signInUrl);

            // Execute the rest of the conversation passing the messageId.
            await runner.RunTestAsync(Path.Combine(_testScriptsFolder, "SignIn2.json"), testParams);
        }
    }
}

[SuppressMessage("StyleCop.CSharp.MaintainabilityRules", "SA1402:File may only contain a single type", Justification = "HttpClientListener instatiation is only used for this class script.")]
public class TestFixture : IDisposable
{
    public TestFixture()
    {
        var cookieContainer = new CookieContainer();
        using var handler = new HttpClientHandler
        {
            AllowAutoRedirect = false,
            CookieContainer = cookieContainer
        };

        // We have a sign in url, which will produce multiple HTTP 302 for redirects
        // This will path 
        //      token service -> other services -> auth provider -> token service (post sign in)-> response with token
        // When we receive the post sign in redirect, we add the cookie passed in the session info
        // to test enhanced authentication. This in the scenarios happens by itself since browsers do this for us.
        HttpClientListener = new HttpClientListener(handler);
    }

    public HttpClientListener HttpClientListener { get; }

    public void Dispose()
    {
        // throw new NotImplementedException();
    }
}
