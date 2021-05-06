import glob from 'glob';
import { readFileSync } from 'fs';
import { TaskFinderOptions, TaskFinderResult } from './interfaces';

export class TaskFinder {
  private readonly task: string;
  private readonly version: string;

  constructor(private readonly options: TaskFinderOptions) {
    if (!this.options.directory?.trim().length) {
      throw new Error("[TaskFinder.constructor]: Missing 'options.root' parameter. (required)");
    }
    if (!this.options.task?.trim().length) {
      throw new Error("[TaskFinder.constructor]: Missing 'options.task' parameter. (required)");
    }

    const [task, version] = this.options.task.split('@');
    this.task = task;
    this.version = version;
    this.options.directory = this.options.directory.endsWith('/')
      ? this.options.directory.slice(0, -1)
      : this.options.directory;
  }

  public find(directory?: string): TaskFinderResult {
    const dir = directory || this.options.directory;
    const folders = glob.sync(`${dir}/**/${this.task}*`);

    for (const folder of folders) {
      const [path] = glob.sync(`${folder}/**/task.json`) || [];
      if (!path) {
        continue;
      }

      const actualFolder = path.replace('/task.json', '');

      const content = JSON.parse(readFileSync(path, { encoding: 'utf8' }));
      if (content?.name === this.task && content?.version.Major === Number(this.version)) {
        if (!content?.execution && Object.keys(content.execution).length === 0) {
          continue;
        }

        const nodeKey = Object.keys(content.execution).find((key) => key.toLowerCase().startsWith('node'));
        const file = content.execution[nodeKey]?.target;
        if (!file) {
          continue;
        }

        const { Major, Minor, Patch } = content?.version;

        return {
          id: content.id,
          name: content.name,
          description: content?.description || '',
          version: `${Major}.${Minor}.${Patch}`,
          author: content?.author || '',
          help: content?.helpUrl || '',
          path: `${actualFolder}/${file}`,
        };
      }
    }
  }
}
