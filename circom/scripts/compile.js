'use strict';

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Paths and constants.
 */
const CIRCUIT_PATH = 'circuits/vote.circom';
const OUTPUT_DIR = 'build';
const R1CS_PATH = path.join(OUTPUT_DIR, 'vote.r1cs');

/**
 * Compile circom circuit and display R1CS information.
 */
function compileCircuit() {
  try {
    ensureOutputDirectory();
    runCircomCompiler();
    printR1csInfo();
  } catch (error) {
    handleError(error);
  }
}

/**
 * Ensure output directory exists.
 */
function ensureOutputDirectory() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
  }
}

/**
 * Run circom compiler.
 */
function runCircomCompiler() {
  const command = `circom ${CIRCUIT_PATH} --r1cs --wasm --sym -o ${OUTPUT_DIR}`;
  execSync(command, {stdio: 'inherit'});
}

/**
 * Print R1CS circuit information.
 */
function printR1csInfo() {
  console.log('Thông tin Circuit:');

  const infoCommand = `snarkjs r1cs info ${R1CS_PATH}`;
  try {
    execSync(infoCommand, {stdio: 'inherit'});
  } catch (error) {
    console.log('  (Chạy "snarkjs r1cs info" để xem chi tiết)');
  }
}

/**
 * Handle fatal errors.
 * @param {Error} error
 */
function handleError(error) {
  console.error('Compile failed');
  console.error(error.message || error);
  process.exit(1);
}

// Run
compileCircuit();
