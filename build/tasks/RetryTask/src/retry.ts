import { join } from 'path';
import { setResourcePath, setResult, TaskResult } from 'azure-pipelines-task-lib/task';
import { Configuration } from './devops/configuration';
import { getTask } from './devops/getTask';
import { executeRunner } from './devops/executeRunner';

async function run() {
  try {
    setResourcePath(join(__dirname, 'task.json'));

    const configuration = new Configuration();

    const task = await getTask({
      directory: configuration.tasksDir,
      task: configuration.task,
    });

    if (task?.id) {
      const result = await executeRunner({ configuration, task });

      if (!result?.hasErrors) {
        setResult(TaskResult.Succeeded, '[TaskRunner] Task execution succeded.');
      }
    }
  } catch (error) {
    setResult(TaskResult.Failed, error);
  }
}

run();
