"use strict";
// process.env.INPUT_TASK = "PowerShell@2";
// process.env.INPUT_DISPLAYNAME = "Set BotBuilder source and version"
// process.env.INPUT_INPUTS = 'targetType: inline\nworkingDirectory: \'C:/Users/JoelMut/Desktop/RetryTask/\'\nfailOnStderr: true\nscript: |\n  Write-Host "Hello";\n  Write-Host "World"'
// process.env.INPUT_INPUTS_WORKINGDIRECTORY = "$(System.DefaultWorkingDirectory)/build"
// process.env.INPUT_INPUTS_TARGETTYPE = "inline"
// process.env.INPUT_INPUTS_SCRIPT = "ls"
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const task_1 = require("azure-pipelines-task-lib/task");
const js_yaml_1 = __importDefault(require("js-yaml"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        task_1.setResourcePath(path_1.default.join(__dirname, 'task.json'));
        const task = task_1.getInput('task', true);
        const displayName = task_1.getInput('displayName', true);
        const inputs = task_1.getInput('inputs', false);
        // const INPUTS_WORKINGDIRECTORY = getInput('INPUTS_WORKINGDIRECTORY', false)
        // const INPUTS_TARGETTYPE = getInput('INPUTS_TARGETTYPE', false)
        // const INPUTS_SCRIPT = getInput('INPUTS_SCRIPT', false)
        const inputsObj = js_yaml_1.default.load(inputs);
        console.dir({ task, displayName, inputs: inputsObj });
        const args = Object.entries(inputsObj).map(([key, val]) => `set INPUT_${key.toUpperCase()}=${val}`.replace(/\n/gm, "%0A")).join("&& ");
        console.log(args);
        // const args = `set INPUT_WORKINGDIRECTORY=${INPUTS_WORKINGDIRECTORY}&& set INPUT_TARGETTYPE=${INPUTS_TARGETTYPE}&& set INPUT_SCRIPT=${INPUTS_SCRIPT}&&`
        // exec(`${args} && node ${__dirname}/test.js`, (err, stdout, stderr) => {
        // exec(`${args} && node C:/Users/JoelMut/Downloads/azure-pipelines-tasks-master/Tasks/PowerShellV2/powershell.js`, (err, stdout, stderr) => {
        child_process_1.exec(`${args} && node ${task}`, (err, stdout, stderr) => {
            console.log('Error: ', err);
            console.log('Output: ', stdout);
            console.log('Output Error: ', stderr);
        });
        // exec('node D:/a/_tasks/PowerShell_e213ff0f-5d5c-4791-802d-52ea3e7be1f1/2.180.1/powershell.js')
    });
}
run();
