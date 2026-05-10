# circom/ — Circom Circuit & Groth16 Pipeline

Off-chain directory: ZKP circuit written in Circom 2.0 and Node.js scripts that
automate the full pipeline from compile → trusted setup → prove → export Solidity verifier.

---

## Directory Structure

```
circom/
├── circuits/
│   ├── hasher.circom        ← Poseidon hash components
│   ├── merkleTree.circom    ← Merkle inclusion proof
│   └── vote.circom          ← Main circuit (entry point)
├── scripts/
│   ├── pipeline.js          ← Orchestrator: runs steps 1–6 in sequence
│   ├── compile.js           ← Step 1: circom → R1CS + WASM
│   ├── trusted_setup.js     ← Step 2: Powers of Tau + Groth16 Phase 2
│   ├── generate_input.js    ← Step 3: generate sample input.json
│   ├── compute_witness.js   ← Step 4: compute witness
│   ├── prove.js             ← Step 5: generate Groth16 proof
│   ├── verify.js            ← Step 6: verify proof off-chain
│   └── export_verifier.js   ← Generate Groth16Verifier.sol (run separately after pipeline)
├── inputs/                  ← Generated input.json
└── build/                   ← All artifacts (gitignored)
```

---

## Installation

```bash
npm install
```

Requires Circom 2.0+ installed (`circom --version`).

---

## Running the Pipeline

```bash
npm run pipeline                    # compile + setup + input + witness + prove + verify
node scripts/export_verifier.js     # generate Groth16Verifier.sol → copy to smart_contract/contracts/
```

---

## Circuits

### `circuits/hasher.circom`

**`Hasher()`** — hashes two field elements using Poseidon:

```
inputs: left, right
output: hash = Poseidon(left, right)
```

Used at each level of `MerkleTreeChecker` to compute the parent node from two children.

**`CommitmentHasher()`** — computes a voter commitment:

```
inputs:  secret, nullifier
output:  commitment = Poseidon(secret, nullifier)
```

This commitment is the leaf stored in the on-chain Merkle Tree.

> **Why Poseidon instead of Keccak-256:** Poseidon costs ~240 constraints in Circom; Keccak-256 costs ~150,000 — 600× more expensive. Poseidon is designed to be efficient over finite fields used in zk-SNARKs.

---

### `circuits/merkleTree.circom`

**`DualMux()`** — selects ordering of two nodes based on a direction bit:

```
sel = 0 → (outL, outR) = (in0, in1)  -- current node on the left
sel = 1 → (outL, outR) = (in1, in0)  -- current node on the right
```

Constraint `sel * (1 - sel) === 0` enforces `sel` is binary.

**`MerkleTreeChecker(levels)`** — verifies a Merkle inclusion proof:

```
inputs:
  leaf                  ← voter commitment to verify
  root                  ← public Merkle root
  pathElements[levels]  ← sibling nodes at each level
  pathIndices[levels]   ← direction bits (0=left, 1=right)

Algorithm:
  currentHash[0] = leaf
  for i in 0..levels-1:
      (L, R) = DualMux(currentHash[i], pathElements[i], pathIndices[i])
      currentHash[i+1] = Hasher(L, R)
  CONSTRAINT: root === currentHash[levels]
```

After `levels = 20` hash rounds, the final constraint ensures the computed root equals the public `merkleRoot`. If the leaf is not in the tree or the path is wrong, the constraint fails and no valid proof can be generated.

**`MerkleTreeInclusionProof(levels)`** — lightweight wrapper around `MerkleTreeChecker` with an `isValid = 1` output signal.

---

### `circuits/vote.circom`

Main circuit — entry point. Defines all logic a voter must prove.

**Template `Vote(levels=20, maxCandidates=8)`**

**Signals:**

```
PUBLIC (7):
  merkleRoot       ← current on-chain Merkle root
  nullifierHash    ← Poseidon(secret) — anonymous ID, prevents double vote
  voteCommitment   ← Poseidon(votes[0..7], blinding) — hidden ballot commitment
  numCandidates    ← total slots incl. abstain at slot 0 (2..8)
  totalVotes       ← voting power per voter (1..255)
  maxPerCandidate  ← max votes for any single slot (1..totalVotes)
  allowAbstain     ← 1 if blank ballot allowed, 0 otherwise

PRIVATE:
  secret           ← voter 254-bit secret
  nullifier        ← 254-bit random combined with secret
  votes[8]         ← integer allocation per slot (votes[0]=abstain)
  blinding         ← random hiding factor
  pathElements[20] ← sibling nodes on path from leaf to root
  pathIndices[20]  ← 0=left / 1=right at each level
```

**12 constraints:**

```
C1  2 ≤ numCandidates         (GreaterEqThan)
C2  numCandidates ≤ 8         (LessEqThan)
C3  1 ≤ totalVotes ≤ 255      (Num2Bits + GreaterEqThan)
C4  1 ≤ maxPerCandidate ≤ totalVotes
C5  allowAbstain is binary
C6  Per-slot: 0 ≤ votes[i] ≤ 255, votes[i] ≤ maxPerCandidate,
    votes[i] = 0 for i ≥ numCandidates
C7  votes[0] = 0 when allowAbstain = 0
C8  votes[0] * realSum = 0   (abstain and real votes are mutually exclusive)
C9  totalUsed ≥ 1            (must cast at least one vote)
C10 totalUsed ≤ totalVotes
C11 commitment = Poseidon(secret, nullifier) is in the Merkle tree (20 levels)
C12 nullifierHash = Poseidon(secret)
C13 voteCommitment = Poseidon(votes[0..7], blinding)
```

**Voting modes** (determined by `totalVotes` + `maxPerCandidate`):

| totalVotes | maxPerCandidate | Mode |
|---|---|---|
| 1 | 1 | Single choice |
| K | 1 | Multiple choice |
| N | N | Cumulative |
| N | C | Cumulative with cap |

---

## Scripts

### `scripts/compile.js`

Compiles `circuits/vote.circom` using the Circom CLI:

```
circom circuits/vote.circom --r1cs --wasm --sym --output build/
```

Output:
- `build/vote.r1cs` — R1CS constraint system.
- `build/vote_js/vote.wasm` — witness generator (WebAssembly).
- `build/vote.sym` — debug symbols (signal name → index).

---

### `scripts/trusted_setup.js`

Performs two-phase Groth16 trusted setup. Caches by comparing SHA-256 of `vote.r1cs` — skips Phase 2 if unchanged.

**Phase 1 — Powers of Tau (universal, reusable):**

```
snarkjs powersoftau new bn128 16 pot16_0000.ptau
snarkjs powersoftau contribute pot16_0000.ptau pot16_0001.ptau -e="<entropy>"
snarkjs powersoftau prepare phase2 pot16_0001.ptau pot16_final.ptau
```

- `power = 16` → supports up to 2^16 = 65,536 constraints.
- `pot16_final.ptau` (~4 MB) is circuit-agnostic and reusable.

**Phase 2 — Groth16 circuit-specific:**

```
snarkjs groth16 setup vote.r1cs pot16_final.ptau vote_0000.zkey
snarkjs zkey contribute vote_0000.zkey vote_final.zkey -e="<entropy>"
snarkjs zkey export verificationkey vote_final.zkey verification_key.json
```

- `vote_final.zkey` (~10–15 MB) is the proving key, tied to `vote.circom`.
- **Must re-run when `vote.circom` changes:** `node scripts/trusted_setup.js --force`

---

### `scripts/generate_input.js`

Generates `inputs/input.json` for a sample voter.

```bash
node scripts/generate_input.js                                          # 3 candidates, vote slot 1
NUM_CANDIDATES=4 CHOICES=1,2 TOTAL_VOTES=2 node scripts/generate_input.js
CHOICES=0 node scripts/generate_input.js                                # abstain
```

Steps:
1. Generate random `secret`, `nullifier`, `blinding` (254-bit via `crypto.randomBytes(31)`).
2. Compute `commitment = Poseidon(secret, nullifier)`.
3. Insert commitment into `IncrementalMerkleTree` (depth 20).
4. Get Merkle proof at index 0 → `pathElements[]`, `pathIndices[]`.
5. Compute `nullifierHash = Poseidon(secret)`.
6. Compute `voteCommitment = Poseidon(votes[0..7], blinding)`.
7. Write everything to `inputs/input.json`.

---

### `scripts/compute_witness.js`

Runs the WASM witness generator:

```
node build/vote_js/generate_witness.js build/vote_js/vote.wasm inputs/input.json build/witness.wtns
```

`witness.wtns` contains all signal values (public + private) satisfying all constraints.

---

### `scripts/prove.js`

Generates a Groth16 proof from the witness and proving key:

```
snarkjs groth16 prove build/vote_final.zkey build/witness.wtns build/proof.json build/public.json
```

- `proof.json` contains `{pi_a, pi_b, pi_c}` — three group elements on BN254.
- `public.json` contains the 7 public signals.

---

### `scripts/verify.js`

Verifies the proof off-chain:

```
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
```

Prints each public signal with its name, then `Proof is VALID` or `INVALID`.

---

### `scripts/export_verifier.js`

Generates the Solidity verifier and copies it to the contracts directory:

```
snarkjs zkey export solidityverifier build/vote_final.zkey build/Groth16Verifier.sol
```

Then automatically copies `build/Groth16Verifier.sol` → `smart_contract/contracts/Groth16Verifier.sol`.

The generated file (~200 lines) contains:
- Hardcoded verification key constants (G1/G2 points for `vk_alpha`, `vk_beta`, `vk_gamma`, `vk_delta`, 8 IC points for 7 public signals).
- `verifyProof(pA, pB, pC, pubSignals)` which calls EVM precompile bn256Pairing (0x08).

---

## Build Artifacts

| File | Size | Purpose |
|------|------|---------|
| `build/vote.r1cs` | ~1–2 MB | Constraint system |
| `build/vote_js/vote.wasm` | ~500 KB | Witness generator (used in browser) |
| `build/pot16_final.ptau` | ~4 MB | Phase 1 — reusable |
| `build/vote_final.zkey` | ~10–15 MB | Proving key (used in browser) |
| `build/verification_key.json` | ~5 KB | Embedded in Groth16Verifier.sol |
| `build/Groth16Verifier.sol` | ~200 lines | Solidity verifier |
| `build/proof.json` | ~1 KB | Sample proof `{pi_a, pi_b, pi_c}` |
| `build/public.json` | <1 KB | Sample 7 public signals |

---

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `pipeline` | `node scripts/pipeline.js` | Run all 6 steps in sequence |
| `compile` | `node scripts/compile.js` | Compile circuit only |
| `setup` | `node scripts/trusted_setup.js` | Trusted setup only (with cache) |
| `input` | `node scripts/generate_input.js` | Generate sample input only |
| `witness` | `node scripts/compute_witness.js` | Compute witness only |
| `prove` | `node scripts/prove.js` | Generate proof only |
| `verify` | `node scripts/verify.js` | Verify proof only |

---

## Dependencies

| Package | Version | Used for |
|---------|---------|----------|
| `snarkjs` | 0.7.5 | Full Groth16 pipeline |
| `circomlibjs` | 0.1.7 | Poseidon in Node.js (`generate_input`) |
| `@zk-kit/incremental-merkle-tree` | 1.1.0 | JS Merkle Tree compatible with Solidity |
