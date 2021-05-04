
export interface TaskClientValues {
  [key: string]: string | number | boolean
}

export interface TaskClientEnvValues {
  [key: string]: string
}

export interface TaskClientOptions {
  path: string;
  displayName?: string;
  inputs?: TaskClientValues
  variables?: TaskClientValues
}

export interface TaskClientResult {
  output: string;
  hasErrors: boolean
}

export interface TaskSearchOptions {
  root: string
  task: string
}

export interface TaskSearchResult {
  id: string;
  name: string;
  version: string;
  path: string;
}

