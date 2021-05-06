import { EOL } from 'os';
import { writeFileSync } from 'fs';
import minimist from 'minimist';

const command = minimist(process.argv.slice(2));

if (command.version || command.v) {
  const version = command.version || command.v;
  const packagejson = require('./package.json');
  const vssextensionjson = require('./vss-extension.json');
  const taskjson = require('./task.json');

  const [Major, Minor, Patch] = version.split('.');

  packagejson.version = version;
  vssextensionjson.version = version;
  taskjson.version = { Major: Number(Major), Minor: Number(Minor), Patch: Number(Patch) };

  writeFileSync('./package.json', JSON.stringify(packagejson, null, 2) + EOL);
  writeFileSync('./vss-extension.json', JSON.stringify(vssextensionjson, null, 2) + EOL);
  writeFileSync('./task.json', JSON.stringify(taskjson, null, 2) + EOL);
}
