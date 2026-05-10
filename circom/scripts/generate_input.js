'use strict';

/**
 * Generate input.json for vote.circom (multiple-choice, commit-reveal).
 *
 * Public signals: merkleRoot, nullifierHash, voteCommitment,
 *                 numCandidates, maxChoices, allowAbstain
 * Private signals: secret, nullifier, choices[8], blinding,
 *                  pathElements[20], pathIndices[20]
 *
 * choices[0] = 1 → abstain; choices[1..N-1] = 1 → vote for candidate i
 *
 * Usage:
 *   node scripts/generate_input.js
 *   NUM_CANDIDATES=4 CHOICES=1,2 MAX_CHOICES=2 ALLOW_ABSTAIN=1 node scripts/generate_input.js
 *   CHOICES=0 node scripts/generate_input.js   # abstain
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const {buildPoseidon}          = require('circomlibjs');
const {IncrementalMerkleTree}  = require('@zk-kit/incremental-merkle-tree');

const TREE_DEPTH  = 20;
const MAX_CANDS   = 8;
const OUTPUT_DIR  = 'inputs';
const OUTPUT_FILE = 'input.json';

function randomFieldElement() {
  return BigInt(`0x${crypto.randomBytes(31).toString('hex')}`);
}

async function main() {
  const poseidon = await buildPoseidon();
  const F        = poseidon.F;
  const hash     = (elts) => BigInt(F.toString(poseidon(elts)));

  const numCandidates = BigInt(process.env.NUM_CANDIDATES || '3');
  const totalVotes    = BigInt(process.env.TOTAL_VOTES    || '1');
  const maxPerCandidate = BigInt(process.env.MAX_PER_CANDIDATE || '1');
  const allowAbstain  = process.env.ALLOW_ABSTAIN === '0' ? 0n : 1n;

  // Parse CHOICES env: comma-separated indices, e.g. "1,2" or "0" (abstain)
  const choiceIndices = (process.env.CHOICES || '1')
    .split(',')
    .map(s => BigInt(s.trim()))
    .filter(i => i >= 0n && i < numCandidates);

  if (choiceIndices.length === 0)
    throw new Error('CHOICES must contain at least one valid index');

  // Validate
  const isAbstain = choiceIndices.length === 1 && choiceIndices[0] === 0n;
  if (isAbstain && allowAbstain === 0n)
    throw new Error('Cannot abstain when allowAbstain=0');

  const realChoices = choiceIndices.filter(i => i > 0n);
  if (realChoices.length > maxPerCandidate)
    throw new Error(`Selected ${realChoices.length} real candidates but maxPerCandidate=${maxPerCandidate}`);

  // Build choices[8] array
  const choices = Array(MAX_CANDS).fill(0n);
  choiceIndices.forEach(i => { choices[Number(i)] = 1n; });

  const secret   = randomFieldElement();
  const nullifier = randomFieldElement();
  const blinding  = randomFieldElement();

  const commitment   = hash([secret, nullifier]);
  const nullifierHash = hash([secret]);
  // voteCommitment = Poseidon(choices[0..7], blinding) — 9 inputs
  const voteCommitment = hash([...choices, blinding]);

  const tree = new IncrementalMerkleTree(
    (e) => hash(e),
    TREE_DEPTH,
    BigInt(0),
    2,
    [],
  );
  tree.insert(commitment);

  const proof       = tree.createProof(0);
  const pathElements = proof.siblings.map((s) => s[0].toString());
  const pathIndices  = proof.pathIndices.map((x) => x.toString());

  const input = {
    // Public
    merkleRoot:     tree.root.toString(),
    nullifierHash:  nullifierHash.toString(),
    voteCommitment: voteCommitment.toString(),
    numCandidates:  numCandidates.toString(),
    totalVotes:     totalVotes.toString(),
    maxPerCandidate: maxPerCandidate.toString(),
    allowAbstain:   allowAbstain.toString(),
    // Private
    secret:         secret.toString(),
    nullifier:      nullifier.toString(),
    votes:          choices.map(String),
    blinding:       blinding.toString(),
    pathElements,
    pathIndices,
  };

  fs.mkdirSync(OUTPUT_DIR, {recursive: true});
  fs.writeFileSync(
    path.join(OUTPUT_DIR, OUTPUT_FILE),
    JSON.stringify(input, null, 2),
  );

  console.log('Wrote', path.join(OUTPUT_DIR, OUTPUT_FILE));
  console.log({
    numCandidates: numCandidates.toString(),
    totalVotes:    totalVotes.toString(),
    maxPerCandidate: maxPerCandidate.toString(),
    allowAbstain:  allowAbstain.toString(),
    choices:       choices.map(String),
    isAbstain,
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
