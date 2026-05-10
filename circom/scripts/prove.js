'use strict';

/**
 * Generate a Groth16 proof for vote.circom.
 * Inputs : build/witness.wtns + build/vote_final.zkey
 * Outputs: build/proof.json + build/public.json
 */

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = 'build';
const ZKEY = path.join(BUILD_DIR, 'vote_final.zkey');
const WITNESS = path.join(BUILD_DIR, 'witness.wtns');
const PROOF = path.join(BUILD_DIR, 'proof.json');
const PUBLIC = path.join(BUILD_DIR, 'public.json');

function assert(p, msg) {
  if (!fs.existsSync(p)) throw new Error(msg);
}

function main() {
  try {
    assert(ZKEY, 'Missing zkey. Run trusted_setup.js first.');
    assert(WITNESS, 'Missing witness. Run compute_witness.js first.');

    const start = Date.now();
    execSync(
      `npx snarkjs groth16 prove ${ZKEY} ${WITNESS} ${PROOF} ${PUBLIC}`,
      {stdio: 'inherit'},
    );
    const ms = Date.now() - start;
    console.log(`Groth16 proof generated in ${(ms / 1000).toFixed(2)}s`);
  } catch (e) {
    console.error('Prove failed:', e.message || e);
    process.exit(1);
  }
}

main();
