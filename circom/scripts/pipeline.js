'use strict';

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  SCRIPTS_DIR: 'scripts',
  BUILD_DIR: 'build',
  INPUT_DIR: 'inputs',
};

function runScript(scriptName) {
  const scriptPath = path.join(CONFIG.SCRIPTS_DIR, scriptName);

  try {
    execSync(`node ${scriptPath}`, {stdio: 'inherit'});
  } catch (error) {
    console.error(`Lỗi khi chạy ${scriptName}`);
    process.exit(1);
  }
}

function checkPrerequisites() {
  checkCircomInstalled();
  installNodeModulesIfNeeded();
  ensureDirectories();
}

function checkCircomInstalled() {
  try {
    execSync('circom --version', {stdio: 'pipe'});
  } catch (error) {
    console.error('Circom chưa được cài đặt');
    process.exit(1);
  }
}

function installNodeModulesIfNeeded() {
  if (!fs.existsSync('node_modules')) {
    execSync('npm install', {stdio: 'inherit'});
  }
}

function ensureDirectories() {
  createDirectoryIfNotExists(CONFIG.BUILD_DIR);
  createDirectoryIfNotExists(CONFIG.INPUT_DIR);
}

function createDirectoryIfNotExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true});
  }
}

function main() {
  const startTime = Date.now();

  checkPrerequisites();

  runScript('compile.js');
  runScript('trusted_setup.js');
  runScript('generate_input.js');
  runScript('compute_witness.js');
  runScript('prove.js');
  runScript('verify.js');

  const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nPipeline hoàn thành trong ${durationSeconds}s`);
}

main();
