'use strict';

/**
 * Export Groth16Verifier.sol from vote_final.zkey.
 * Run after trusted_setup.js.
 *
 * Outputs:
 *   - code/build/Groth16Verifier.sol     (canonical)
 *   - evm/contracts/Groth16Verifier.sol  (copy for Hardhat compile)
 */

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const ZKEY = path.join('build', 'vote_final.zkey');
const OUT = path.join('build', 'Groth16Verifier.sol');
const EVM_TARGET = path.join('..', 'evm', 'contracts', 'Groth16Verifier.sol');

function main() {
  if (!fs.existsSync(ZKEY)) {
    console.error('Missing zkey:', ZKEY);
    console.error('Run first: node scripts/trusted_setup.js');
    process.exit(1);
  }

  execSync(
    `npx snarkjs zkey export solidityverifier ${ZKEY} ${OUT}`,
    {stdio: 'inherit'},
  );
  console.log('Exported:', OUT);

  const evmDir = path.join('..', 'evm', 'contracts');
  if (fs.existsSync(evmDir)) {
    fs.copyFileSync(OUT, EVM_TARGET);
    console.log('Copied to:', EVM_TARGET);
  } else {
    console.warn('evm/contracts not found, skipping copy.');
  }
}

main();
