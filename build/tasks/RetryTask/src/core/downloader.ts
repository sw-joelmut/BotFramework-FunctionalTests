import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

const streamPipeline = promisify(pipeline);

export class TaskDownloader {
  private readonly repoUrl: string = 'https://api.github.com/repos/microsoft/azure-pipelines-tasks';
  private readonly dist: string;

  constructor() {
    this.dist = `${__dirname}/../../azure-pipelines-tasks`;
  }

  public getSourceCodePath(): string {
    if (existsSync(this.dist)) {
      return this.dist;
    }
  }

  public async downloadSourceCode(): Promise<string> {
    if (existsSync(this.dist)) {
      return this.dist;
    } else {
      mkdirSync(this.dist, { recursive: true });
    }

    const data = await fetch(this.repoUrl);
    const repoInfo = await data.json();

    console.log(repoInfo?.default_branch);

    const response = await fetch(`${this.repoUrl}/zipball/${repoInfo.default_branch}`);

    if (!response.ok) {
      // TODO: Better error handling.
      throw '';
    }

    await streamPipeline(response.body, createWriteStream(`${this.dist}.zip`));
    const zip = new AdmZip(`${this.dist}.zip`);
    zip.extractAllTo(this.dist);

    return this.dist;
  }
}
