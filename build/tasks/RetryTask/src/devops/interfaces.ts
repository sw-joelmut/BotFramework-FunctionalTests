import { TaskFinderResult } from '../core/interfaces';
import { Configuration } from './configuration';

export interface ConfigurationInputs {
  [key: string]: string;
}

export interface ExecuteRunnerOptions {
  configuration: Configuration;
  task: TaskFinderResult;
}

export interface ExecuteRunnerResult {
  hasErrors: boolean;
  output: string;
  retry: number;
}
