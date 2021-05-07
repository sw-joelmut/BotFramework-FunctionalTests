import { exec } from 'child_process';

export class TaskInstaller {
  constructor() {}

  public async install(path: string) {
    return new Promise((resolve, reject) =>
      exec(`npm install`, { cwd: path }, (err, stdout, stderr) =>
        stderr ? reject(stderr) : err ? reject(err) : resolve(stdout)
      )
    );
  }
}
