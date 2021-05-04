import glob from "glob";
import { readFileSync } from "fs";
import { TaskSearchOptions, TaskSearchResult } from "./interfaces";


export class TaskSearch {
  constructor(private readonly options: TaskSearchOptions) {
    if (!this.options.root?.trim().length) {
      throw new Error("[TaskSearch.constructor]: Missing 'options.root' parameter. (required)");
    }
    if (!this.options.task?.trim().length) {
      throw new Error("[TaskSearch.constructor]: Missing 'options.task' parameter. (required)");
    }
    
    this.options.root = this.options.root.endsWith('/') ? this.options.root.slice(0, -1) : this.options.root
  }

  public async search(): Promise<TaskSearchResult> {
    const [task, version] = this.options.task.split('@');

    let result: TaskSearchResult;

    const folders = glob.sync(`${this.options.root}/${task}*`)

    for (const folder of folders) {
      const [path] = glob.sync(`${folder}/**/task.json`) || []
      if (!path) {
        continue;
      }

      const content = JSON.parse(readFileSync(path, { encoding: 'utf8' }))
      if (content?.name === task && content?.version.Major === Number(version)) {
        if (!content?.execution && Object.keys(content.execution).length === 0) {
          continue;
        }

        const nodeKey = Object.keys(content.execution).find(key => key.toLowerCase().startsWith('node'))
        const file = content.execution[nodeKey]?.target;
        if (!file) {
          continue;
        }

        const { Major, Minor, Patch } = content?.version;

        result = {
          id: content.id,
          name: content.name,
          version: `${Major}.${Minor}.${Patch}`,
          path: `${folder}/${file}`
        }
        break;
      }
    }

    if (!result) {
      this.download()
    }

    // return `C:/Users/JoelMut/Downloads/azure-pipelines-tasks-master/Tasks/PowerShellV2/powershell.js`
    // return `${__dirname}/../test.js`
    return result;
  }

  private download() {
    // TODO: Download the task
  }
}
