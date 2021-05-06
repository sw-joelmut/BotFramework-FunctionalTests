import minimist from 'minimist';
import fs from 'fs';

const command = minimist(process.argv.slice(2));

if (command.version || command.v) {
  const version = command.version || command.v;
  const packagejson = require('./package.json');
  const vssextensionjson = require('./vss-extension.json');
  const taskjson = require('./task.json');

  const [Mayor, Minor, Patch] = version.split('.');

  packagejson.version = version;
  vssextensionjson.version = version;
  taskjson.version = { Mayor, Minor, Patch };

  fs.writeFileSync('./package.json', JSON.stringify(packagejson));
  fs.writeFileSync('./vss-extension.json', JSON.stringify(vssextensionjson));
  fs.writeFileSync('./task.json', JSON.stringify(taskjson));
}
