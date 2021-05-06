import { setResult, TaskResult } from 'azure-pipelines-task-lib/task';
import { TaskFinder } from '../core/finder';
import { TaskDownloader } from '../core/downloader';
import { TaskFinderOptions, TaskFinderResult } from '../core/interfaces';

// TODO: Store this in a local storage.
const store = new Map();

export async function getTask(options: TaskFinderOptions): Promise<TaskFinderResult> {
  let task;
  console.log(`[TaskFinder] Looking for installed ${options.task} task in '${options.directory}'.`);

  const finder = new TaskFinder(options);

  const path = store.get(options.task);

  task = finder.find(path);

  if (!task) {
    console.log(`[TaskFinder] Unable to find ${options.task} task in '${options.directory}'.`);

    console.log(
      `[TaskFinder] Dowloading ${options.task} task from [microsoft/azure-pipelines-tasks](https://github.com/microsoft/azure-pipelines-tasks).`
    );

    const downloader = new TaskDownloader();
    const installer = new TaskInstaller();

    const path = await downloader.downloadSourceCode();
    store.set(options.task, path);
    await installer.install();
    task = finder.find(path);
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
