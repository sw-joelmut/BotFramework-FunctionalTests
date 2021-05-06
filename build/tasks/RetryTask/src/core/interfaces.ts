export interface TaskRunnerValues {
  [key: string]: string | number | boolean;
}

export interface TaskRunnerEnvValues {
  [key: string]: string;
}

export interface TaskRunnerOptions {
  path: string;
  displayName?: string;
  inputs?: TaskRunnerValues;
  variables?: TaskRunnerValues;
}

export interface TaskRunnerResult {
  output: string;
  hasErrors: boolean;
}

export interface TaskSearchOptions {
  directory: string;
  task: string;
}

export interface TaskSearchResult {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  help: string;
  path: string;
}
