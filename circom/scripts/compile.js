'use strict';

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const CIRCUIT_PATH = 'circuits/vote.circom';
const OUTPUT_DIR = 'build';
const R1CS_PATH = path.join(OUTPUT_DIR, 'vote.r1cs');

function compileCircuit() {
  try {
    ensureOutputDirectory();
    runCircomCompiler();
    printR1csInfo();
  } catch (error) {
    handleError(error);
  }
}

function ensureOutputDirectory() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
  }
}

function runCircomCompiler() {
  const command = `circom ${CIRCUIT_PATH} --r1cs --wasm --sym -o ${OUTPUT_DIR}`;
  execSync(command, {stdio: 'inherit'});
}

function printR1csInfo() {
  console.log('Circuit info:');
  const infoCommand = `snarkjs r1cs info ${R1CS_PATH}`;
  try {
    execSync(infoCommand, {stdio: 'inherit'});
  } catch (error) {
    console.log('  (run "snarkjs r1cs info" for details)');
  }
}

function handleError(error) {
  console.error('Compile failed');
  console.error(error.message || error);
  process.exit(1);
}

// Run
compileCircuit();
