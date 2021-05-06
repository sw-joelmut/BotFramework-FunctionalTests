import { setResult, TaskResult } from 'azure-pipelines-task-lib/task';
import { TaskRunner } from '../core/runner';
import { ExecuteRunnerOptions, ExecuteRunnerResult } from './interfaces';

export async function executeRunner(options: ExecuteRunnerOptions): Promise<ExecuteRunnerResult> {
  const { configuration, task } = options;

  console.log('\r');
  console.log('============================== [TaskRunner] Task =============================');
  console.log(`Name          : ${configuration.displayName}`);
  console.log(`Max. Retries  : ${configuration.maxRetries}`);
  console.log(`Inputs        : ${Object.keys(configuration.inputs).join(', ')}`);
  console.log('==============================================================================');

  const runner = new TaskRunner({
    path: task.path,
    displayName: configuration.displayName,
    inputs: configuration.inputs,
    variables: process.env,
  });

  const state = { output: '', hasErrors: false, retry: 1 };

  for (state.retry; state.retry <= configuration.maxRetries; state.retry++) {
    console.log('\r');
    console.log(
      `============================ [TaskRunner] Run ${state.retry}/${configuration.maxRetries} ============================`
    );

    try {
      const { output, hasErrors } = await runner.run();
      state.hasErrors = hasErrors;
      state.output = output;
    } catch (error) {
      state.hasErrors = true;
      state.output = error;
    }

    console.log(state.output);
    console.log('==============================================================================');

    if (state.hasErrors) {
      continue;
    }

    break;
  }

  if (state.hasErrors) {
    setResult(TaskResult.Failed, '[TaskRunner] Task execution failed.');
  }

  return {
    hasErrors: state.hasErrors,
    output: state.output,
    retry: state.retry,
  };
}
