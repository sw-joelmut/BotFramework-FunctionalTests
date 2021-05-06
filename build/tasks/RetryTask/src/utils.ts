import yaml from 'js-yaml';
import { getInput } from 'azure-pipelines-task-lib';

export function getInputYaml<T extends object>(name: string, required?: boolean): T {
  return <T>yaml.load(getInput(name, required));
}

export function getInputNumber(name: string, required?: boolean): number {
  return parseInt(getInput(name, required)) || null;
}
