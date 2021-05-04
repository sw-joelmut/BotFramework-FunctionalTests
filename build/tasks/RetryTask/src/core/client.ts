import { exec } from "child_process";
import { TaskClientOptions, TaskClientEnvValues, TaskClientValues, TaskClientResult } from "./interfaces";


export class TaskClient {
  constructor(private readonly options: TaskClientOptions) { }

  /**
   * execute
   */
  public async run(): Promise<TaskClientResult> {
    const inputs = this.createEnvValues('input', this.options.inputs || {});
    const variables = this.createEnvValues('variable', this.options.variables || {});
    const output = await this.execute(this.options.path, { ...inputs, ...variables });
    const hasErrors = this.inspectResult(output);

    return { output, hasErrors };
  }

  private createEnvValues(type: 'input' | 'variable', values: TaskClientValues): TaskClientEnvValues {
    if (!type?.trim()) {
      throw new Error("[TaskClient.createEnvValues]: Missing 'input' parameter. (required)");
    }
    if (!values && Object.keys(values).length === 0) {
      throw new Error("[TaskClient.createEnvValues]: Missing 'values' parameter. (required)");
    }

    const prependKey = {
      input: 'INPUT_',
      variable: ''
    }[type]

    return Object.entries(values)
      .reduce((acc, [key, val]) => {
        const newKey = `${prependKey}${key}`
          .replace(/\.| /g, '_')
          .toUpperCase();
        acc[newKey] = val.toString();
        return acc;
      }, {})
  }

  private execute(path: string, inputs?: TaskClientEnvValues): Promise<string> {
    if (!path?.trim().length) {
      throw new Error("[TaskClient.executeTask]: Missing 'path' parameter. (required)");
    }

    return new Promise((resolve, reject) =>
      exec(`node ${path}`, { env: inputs || {} }, (err, stdout, stderr) => stderr ? reject(stderr) : err ? reject(err) : resolve(stdout))
    )
  }

  private inspectResult(output: string): boolean {
    return output?.includes('##vso[task.issue type=error;]')
  }
}
