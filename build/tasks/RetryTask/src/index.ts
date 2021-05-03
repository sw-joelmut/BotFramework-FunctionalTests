// process.env.INPUT_TASK = `${__dirname}/test.js`;
process.env.INPUT_TASK = `C:/Users/JoelMut/Downloads/azure-pipelines-tasks-master/Tasks/PowerShellV2/powershell.js`;
process.env.INPUT_DISPLAYNAME = "Set BotBuilder source and version"
process.env.INPUT_INPUTS = `targetType: inline\nworkingDirectory: \'C:/Users/JoelMut/Desktop/RetryTask/\'\nfailOnStderr: true\nscript: | \n  Write-Host 'Hello';\n  Write-Host 'World'`
// process.env.INPUT_INPUTS_WORKINGDIRECTORY = "C:/Users/JoelMut/Desktop/RetryTask/"
// process.env.INPUT_INPUTS_TARGETTYPE = "inline"
// process.env.INPUT_INPUTS_SCRIPT = "ls"

import path from "path";
import { exec } from "child_process";
import { setResourcePath, getInput } from "azure-pipelines-task-lib/task";
import yaml from 'js-yaml'

async function run() {
  setResourcePath(path.join(__dirname, 'task.json'));

  const task = getInput('task', true)
  const displayName = getInput('displayName', true)
  const inputs = getInput('inputs', false)
  // const INPUTS_WORKINGDIRECTORY = getInput('INPUTS_WORKINGDIRECTORY', false)
  // const INPUTS_TARGETTYPE = getInput('INPUTS_TARGETTYPE', false)
  // const INPUTS_SCRIPT = getInput('INPUTS_SCRIPT', false)


  const inputsObj: any = yaml.load(inputs);

  console.dir();


  inputsObj.script = `"Write-Host 'Hello';\nWrite-Host 'World';"`

  const args = Object.entries(inputsObj).map(([key, val]) => ` INPUT_${key.toUpperCase()}=${val}`).join(" ")

  console.log(args);

  const taskFields = { task, displayName, inputs: inputsObj };

  // const args = `set INPUT_WORKINGDIRECTORY=${INPUTS_WORKINGDIRECTORY}&& set INPUT_TARGETTYPE=${INPUTS_TARGETTYPE}&& set INPUT_SCRIPT=${INPUTS_SCRIPT}&&`
  process.env.INPUT_WORKINGDIRECTORY = "C:/Users/JoelMut/Desktop/RetryTask/"
  process.env.INPUT_TARGETTYPE = "inline"
  process.env.INPUT_SCRIPT = `
    ls
  `

  // exec(`${args} && node ${__dirname}/test.js`, (err, stdout, stderr) => {
  // exec(`${args} && node C:/Users/JoelMut/Downloads/azure-pipelines-tasks-master/Tasks/PowerShellV2/powershell.js`, (err, stdout, stderr) => {
  // exec(`node -r "${__dirname}/env.js" ${task}`, (err, stdout, stderr) => {
  exec(`node ${task}`, { env: process.env }, (err, stdout, stderr) => {
    console.log('Error: ', err);
    console.log('Output: ', stdout);
    console.log('Output Error: ', stderr);
  })
  // exec('node D:/a/_tasks/PowerShell_e213ff0f-5d5c-4791-802d-52ea3e7be1f1/2.180.1/powershell.js')
}

run()


