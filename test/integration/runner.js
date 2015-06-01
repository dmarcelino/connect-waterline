var exec = require('child_process').exec;
var async = require('async');

// The adapters being tested
var adapters = ['sails-memory', 'sails-disk', 'sails-mongo', 'sails-postgresql', 'sails-mysql', 'sails-redis'];

var exitCode = 0;
console.time('total time elapsed');


async.eachSeries(adapters, function(adapterName, next){
  
  console.log("\n");
  console.log("\033[0;34m-------------------------------------------------------------------------------------------\033[0m");
  console.log("\033[0;34m                                     %s \033[0m", adapterName);
  console.log("\033[0;34m-------------------------------------------------------------------------------------------\033[0m");
  console.log();
  
  process.env.ADAPTER_NAME = adapterName;
  
  var child = exec('mocha test/unit', { env: process.env });
  child.stdout.on('data', function(data) {
    process.stdout.write(data);
  });
  child.stderr.on('data', function(data) {
    process.stdout.write(data);
  });
  child.on('close', function(code) {
    console.log(adapterName + ', exit code: ' + code);
    exitCode = exitCode + code;
    next();
  });
},

function(err, res){
  console.timeEnd('total time elapsed');
  if(err){
    console.error('Something wrong happened:', err);
  }
  console.log('exit code: ' + exitCode);
  process.exit(exitCode);
});