'use strict';

// --force flag re-runs Phase 2 even if R1CS hasn't changed

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CIRCUIT_NAME = 'vote';
const BUILD_DIR = 'build';
const PTAU_POWER = 16;
const CURVE = 'bn128';
const R1CS_STAMP = path.join(BUILD_DIR, 'r1cs.sha256');

const PTAU_0 = path.join(BUILD_DIR, `pot${PTAU_POWER}_0000.ptau`);
const PTAU_1 = path.join(BUILD_DIR, `pot${PTAU_POWER}_0001.ptau`);
const PTAU_FINAL = path.join(BUILD_DIR, `pot${PTAU_POWER}_final.ptau`);

const R1CS = path.join(BUILD_DIR, `${CIRCUIT_NAME}.r1cs`);
const ZKEY_0 = path.join(BUILD_DIR, `${CIRCUIT_NAME}_0000.zkey`);
const ZKEY_FINAL = path.join(BUILD_DIR, `${CIRCUIT_NAME}_final.zkey`);
const VKEY = path.join(BUILD_DIR, 'verification_key.json');

function entropy() {
  return crypto.randomBytes(32).toString('hex');
}

function hashFile(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, {recursive: true});
}

function shouldSkipPhase2() {
  if (process.argv.includes('--force')) {
    console.log('(--force) Re-running Phase 2.\n');
    return false;
  }
  if (!fs.existsSync(ZKEY_FINAL) || !fs.existsSync(R1CS_STAMP)) return false;
  const prev = fs.readFileSync(R1CS_STAMP, 'utf8').trim();
  const now = hashFile(R1CS);
  if (now && prev === now) {
    console.log('R1CS unchanged — skipping Phase 2 (reusing vote_final.zkey).');
    console.log('To force re-setup: node scripts/trusted_setup.js --force\n');
    return true;
  }
  console.log('R1CS changed — re-running Phase 2.\n');
  return false;
}

function runPhase1IfNeeded() {
  if (fs.existsSync(PTAU_FINAL)) return;
  console.log('Phase 1: Powers of Tau (universal, circuit-agnostic)');
  execSync(
    `npx snarkjs powersoftau new ${CURVE} ${PTAU_POWER} ${PTAU_0}`,
    {stdio: 'inherit'},
  );
  execSync(
    `npx snarkjs powersoftau contribute ${PTAU_0} ${PTAU_1} -e="${entropy()}"`,
    {stdio: 'inherit'},
  );
  execSync(
    `npx snarkjs powersoftau prepare phase2 ${PTAU_1} ${PTAU_FINAL}`,
    {stdio: 'inherit'},
  );
}

function runPhase2() {
  if (!fs.existsSync(R1CS)) {
    throw new Error(`R1CS not found at ${R1CS}. Run compile.js first.`);
  }
  console.log('Phase 2: Groth16 circuit-specific setup');

  execSync(
    `npx snarkjs groth16 setup ${R1CS} ${PTAU_FINAL} ${ZKEY_0}`,
    {stdio: 'inherit'},
  );
  execSync(
    `npx snarkjs zkey contribute ${ZKEY_0} ${ZKEY_FINAL} -e="${entropy()}"`,
    {stdio: 'inherit'},
  );
  execSync(
    `npx snarkjs zkey export verificationkey ${ZKEY_FINAL} ${VKEY}`,
    {stdio: 'inherit'},
  );

  const h = hashFile(R1CS);
  if (h) fs.writeFileSync(R1CS_STAMP, h + '\n');
}

function main() {
  try {
    ensureDir(BUILD_DIR);
    runPhase1IfNeeded();
    if (!shouldSkipPhase2()) runPhase2();
    console.log('Groth16 trusted setup complete.');
  } catch (e) {
    console.error('Setup failed:', e.message || e);
    process.exit(1);
  }
}

main();
