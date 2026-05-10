'use strict';

/**
 * Verify a Groth16 proof off-chain.
 * Reads build/verification_key.json + build/proof.json + build/public.json.
 */

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = 'build';
const VKEY = path.join(BUILD_DIR, 'verification_key.json');
const PROOF = path.join(BUILD_DIR, 'proof.json');
const PUBLIC = path.join(BUILD_DIR, 'public.json');

function assert(p, msg) {
  if (!fs.existsSync(p)) throw new Error(msg);
}

function printPublicSignals() {
  try {
    const sig = JSON.parse(fs.readFileSync(PUBLIC, 'utf8'));
    if (sig.length >= 4) {
      console.log('Public signals:');
      console.log('  merkleRoot     :', sig[0].slice(0, 24) + '…');
      console.log('  nullifierHash  :', sig[1].slice(0, 24) + '…');
      console.log('  voteCommitment :', sig[2].slice(0, 24) + '…');
      console.log('  numCandidates  :', sig[3]);
    } else {
      sig.forEach((v, i) => console.log(`  [${i}] ${v}`));
    }
  } catch {}
}

function main() {
  try {
    assert(VKEY, 'Missing verification_key.json. Run trusted_setup.js first.');
    assert(PROOF, 'Missing proof.json. Run prove.js first.');
    assert(PUBLIC, 'Missing public.json. Run prove.js first.');

    printPublicSignals();
    const start = Date.now();
    const output = execSync(
      `npx snarkjs groth16 verify ${VKEY} ${PUBLIC} ${PROOF}`,
      {encoding: 'utf8'},
    );
    const ms = Date.now() - start;
    console.log(output);
    if (!/OK|VALID/i.test(output)) throw new Error('Verifier rejected the proof.');
    console.log(`Verified in ${ms}ms — PROOF IS VALID`);
  } catch (e) {
    console.error('Verify failed:', e.message || e);
    process.exit(1);
  }
}

main();
