import path from "path";
import { setResourcePath, getInput } from "azure-pipelines-task-lib/task";
import yaml from 'js-yaml'
import { TaskClient } from "./core/client";
import { getTimestamp } from "./core/utils";
import { TaskClientOptions } from "./core/interfaces";
import { TaskSearch } from "./core/search";

async function run() {
  setResourcePath(path.join(__dirname, 'task.json'));

  // DevOps task interface
  // const inputs = {
  //   name: getInput('name', true),
  //   displayName: getInput('displayName', false),
  //   inputs: <object>yaml.load(getInput('inputs', false)),
  //   maxRetries: getInput('maxRetries', false),
  // }

  const taskName = 'PowerShell@2'
  const taskDisplayName = 'Execute Task'
  const tasksFolder = 'C:/Users/JoelMut/Downloads/azure-pipelines-tasks-master/Tasks/'

  const maxRetries = 3;

  const logTitle = `${taskName}${taskDisplayName ? ` - ${taskDisplayName}` : ''}`;

  console.log('\r\n');
  console.log(`${getTimestamp()} ========================== Starting Execution: ${logTitle} ===========================`);
  console.log('\r');

  const search = new TaskSearch({
    root: tasksFolder,
    task: taskName
  });

  const task = await search.search()

  const client = new TaskClient({
    path: task.path,
    displayName: taskDisplayName,
    inputs: {
      targetType: 'inline',
      workingDirectory: 'C:/Users/JoelMut/Desktop/RetryTask/',
      failOnStderr: false,
      script: '\n  Write-Host "Hello";\n  Write-Host "World"; \n throw "Error"'
    }
  })

  for (let i = 0; i < maxRetries; i++) {
    const state = { output: '', retry: false };

    try {
      const { output, hasErrors } = await client.run();
      state.retry = hasErrors;
      state.output = output;
    } catch (error) {
      state.retry = true;
      state.output = error;
    }

    if (state.retry) {
      console.log('\r');
      console.log(`${getTimestamp()} ========================== Retry [${i + 1}/${maxRetries}] Execution: ${logTitle} ===========================`);
      console.log('\r');
      console.log(state.output);
      continue;
    }

    console.log(state.output);
    break;
  }

  console.log('\r');
  console.log(`${getTimestamp()} ========================== Ending Execution: ${logTitle} ===========================`);
  console.log('\r');
}

run();

