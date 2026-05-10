'use strict';

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Constants.
 */
const CIRCUIT_NAME = 'vote';
const BUILD_DIR = 'build';
const DEFAULT_INPUT_FILE = 'inputs/input.json';

/**
 * CLI arguments.
 */
const inputFilePath = process.argv[2] || DEFAULT_INPUT_FILE;

/**
 * Generated paths.
 */
const WASM_PATH = path.join(
  BUILD_DIR,
  `${CIRCUIT_NAME}_js`,
  `${CIRCUIT_NAME}.wasm`,
);

const GENERATOR_PATH = path.join(
  BUILD_DIR,
  `${CIRCUIT_NAME}_js`,
  'generate_witness.js',
);

const WITNESS_PATH = path.join(BUILD_DIR, 'witness.wtns');

/**
 * Ensure required files exist.
 * @param {string} filePath
 * @param {string} errorMessage
 */
function assertFileExists(filePath, errorMessage) {
  if (!fs.existsSync(filePath)) {
    throw new Error(errorMessage);
  }
}

/**
 * Compute witness.
 */
function computeWitness() {
  try {
    assertFileExists(
      WASM_PATH,
      'WASM not found. Run compile.js first.',
    );

    assertFileExists(
      GENERATOR_PATH,
      'Witness generator not found.',
    );

    assertFileExists(
      inputFilePath,
      'Input file not found.',
    );

    const command =
      `node ${GENERATOR_PATH} ${WASM_PATH} ${inputFilePath} ${WITNESS_PATH}`;

    execSync(command, {stdio: 'inherit'});
  } catch (error) {
    handleError(error);
  }
}

/**
 * Handle fatal errors.
 * @param {Error} error
 */
function handleError(error) {
  console.error('Witness computation failed');
  console.error(error.message || error);
  process.exit(1);
}

// Run
computeWitness();
