import { setResult, TaskResult } from 'azure-pipelines-task-lib/task';
import { TaskFinder } from '../core/finder';
import { TaskDownloader } from '../core/downloader';
import { TaskFinderOptions, TaskFinderResult } from '../core/interfaces';
import { TaskInstaller } from '../core/installer';

// TODO: Store this in a local storage.
const store = new Map();

export async function getTask(options: TaskFinderOptions): Promise<TaskFinderResult> {
  let task;
  console.log(`[TaskFinder] Looking for installed ${options.task} task in '${options.directory}'.`);

  const path = store.get(options.task);

  const finder = new TaskFinder(options);
  // Search for task, if directory isn't provided it will use the constructor directory.
  task = finder.find(path);

  if (!task) {
    console.log(`[TaskFinder] Unable to find ${options.task} task in '${options.directory}'.`);

    console.log(
      `[TaskFinder] Dowloading ${options.task} task from [microsoft/azure-pipelines-tasks](https://github.com/microsoft/azure-pipelines-tasks).`
    );

    const downloader = new TaskDownloader();
    const installer = new TaskInstaller();

    const path = await downloader.downloadSourceCode();

    if (path) {
      task = finder.find(path);

      if (task) {
        await installer.install(task.path);
        store.set(options.task, task.path);
      } else {
        console.log(`[TaskFinder] Unable to find downloaded ${options.task} task in '${path}'.`);
      }
    } else {
      console.log(`[TaskFinder] Unable to download and unzip source code from 'microsoft/azure-pipelines-tasks'.`);
    }
  }

  if (task) {
    console.log('\r');
    console.log('================================== Task Info =================================');
    console.log(`Id            : ${task.id}`);
    console.log(`Task          : ${task.name}`);
    console.log(`Description   : ${task.description}`);
    console.log(`Version       : ${task.version}`);
    console.log(`Author        : ${task.author}`);
    console.log(`Help          : ${task.help}`);
    console.log(`Path          : ${task.path}`);
    console.log('==============================================================================');
  } else {
    setResult(TaskResult.Failed, `[TaskFinder] Unable to retrieve ${options.task} task.`);
  }

  return task;
}
