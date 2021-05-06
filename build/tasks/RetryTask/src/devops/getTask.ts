import { setResult, TaskResult } from 'azure-pipelines-task-lib/task';
import { TaskFinder } from '../core/finder';
import { TaskFinderOptions, TaskFinderResult } from '../core/interfaces';

export async function getTask(options: TaskFinderOptions): Promise<TaskFinderResult> {
  console.log(`[TaskFinder] Looking for installed ${options.task} task in '${options.directory}'.`);

  const finder = new TaskFinder(options);
  let task = finder.find();

  if (!task) {
    console.log(`[TaskFinder] Unable to find ${options.task} task in '${options.directory}'.`);

    // TODO: Disabled until implemented.
    // console.log(`[TaskFinder] Dowloading ${options.task} task from [microsoft/azure-pipelines-tasks](https://github.com/microsoft/azure-pipelines-tasks).`);

    // task = await finder.downloadFromSourceCode();
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
