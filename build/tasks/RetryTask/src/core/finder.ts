import glob from 'glob';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { readFileSync, createWriteStream } from 'fs';
import { TaskFinderOptions, TaskFinderResult } from './interfaces';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

const streamPipeline = promisify(pipeline);

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

  public find(): TaskFinderResult {
    const folders = glob.sync(`${this.options.directory}/${this.task}*`);

    for (const folder of folders) {
      const [path] = glob.sync(`${folder}/**/task.json`) || [];
      if (!path) {
        continue;
      }

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
          path: `${folder}/${file}`,
        };
      }
    }
  }

  public async downloadFromSourceCode(): Promise<TaskFinderResult> {
    // TODO: Download the task
    const repoUrl = 'https://api.github.com/repos/microsoft/azure-pipelines-tasks';

    const data = await fetch(repoUrl);
    const repoInfo = await data.json();

    console.log(repoInfo?.default_branch);

    const response = await fetch(`${repoUrl}/zipball/${repoInfo.default_branch}`);

    if (!response.ok) {
      throw '';
    }

    await streamPipeline(response.body, createWriteStream(`${__dirname}/test/azure-pipelines-tasks.zip`));

    const zip = new AdmZip(`${__dirname}/test/azure-pipelines-tasks.zip`);
    zip.extractAllTo(`${__dirname}/test/azure-pipelines-tasks`);

    console.log('finished');

    return {
      id: '',
      name: '',
      description: '',
      version: '',
      author: '',
      help: '',
      path: '',
    };
  }
}
