
const path = require('path')
const t = require('azure-pipelines-task-lib/task')


function name() {
  t.setResourcePath(path.join(__dirname, '../task.json'));
  
  const targetType = t.getInput('targetType2', true)
  const workingDirectory = t.getInput('workingDirectory', true)
  const failOnStderr = t.getInput('failOnStderr', false)
  const script = t.getInput('script', true)
  
  console.dir({ workingDirectory, targetType,failOnStderr, script });
}


name()
