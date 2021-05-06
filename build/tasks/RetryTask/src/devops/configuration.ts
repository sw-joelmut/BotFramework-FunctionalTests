import { getInput, getVariable } from 'azure-pipelines-task-lib/task';
import { getInputNumber, getInputYaml } from '../utils';
import { ConfigurationInputs } from './interfaces';

export class Configuration {
  public readonly tasksDir: string;
  public readonly task: string;
  public readonly displayName: string;
  public readonly inputs: ConfigurationInputs;
  public readonly maxRetries: number;

  constructor() {
    const rootDir = getVariable('agent.rootDirectory') || '';
    this.tasksDir = process.env.TASKSDIR || `${rootDir}/_tasks`;
    this.task = getInput('task', true);
    this.displayName = getInput('displayName', false);
    this.inputs = getInputYaml('inputs', false); // fail devops task on conversion
    this.maxRetries = getInputNumber('maxRetries', false);
    this.maxRetries = this.maxRetries > 0 ? this.maxRetries : 1;
  }
}
