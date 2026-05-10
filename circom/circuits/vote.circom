pragma circom 2.0.0;

/*
 * ============================================================
 * VOTE.CIRCOM — Universal Anonymous Voting Circuit
 * ============================================================
 *
 * One circuit supports all voting types via runtime parameters:
 *
 *   Single choice:          totalVotes=1,   maxPerCandidate=1
 *   Multiple choice (max K): totalVotes=K,   maxPerCandidate=1
 *   Cumulative (N votes):    totalVotes=N,   maxPerCandidate=N
 *   Hybrid (N votes, cap C): totalVotes=N,   maxPerCandidate=C
 *
 * Public signals (7):
 *   merkleRoot       — on-chain Merkle root of voter set
 *   nullifierHash    — Poseidon(secret), prevents double voting
 *   voteCommitment   — Poseidon(votes[0..7], blinding), hidden ballot
 *   numCandidates    — total slots including abstain at index 0
 *   totalVotes       — voting power per voter (1..255)
 *   maxPerCandidate  — max votes for any single slot (1..totalVotes)
 *   allowAbstain     — 1 if blank ballot allowed (slot 0), else 0
 *
 * Private signals:
 *   secret, nullifier         — voter identity
 *   votes[8]                  — integer allocation per slot (0..maxPerCandidate)
 *   blinding                  — random hiding factor
 *   pathElements[20], pathIndices[20] — Merkle proof
 *
 * Convention:
 *   votes[0] = abstain weight  (must be 0 if !allowAbstain)
 *   votes[1..numCandidates-1] = votes for real candidates
 *   votes[0] > 0 is exclusive with sum(votes[1..]) > 0
 * ============================================================
 */

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "merkleTree.circom";

template Vote(levels, maxCandidates) {

    // ==================== PUBLIC SIGNALS ====================
    signal input merkleRoot;
    signal input nullifierHash;
    signal input voteCommitment;
    signal input numCandidates;     // total slots incl. abstain at 0 (2..8)
    signal input totalVotes;        // total voting power per voter   (1..255)
    signal input maxPerCandidate;   // max votes for any single slot  (1..totalVotes)
    signal input allowAbstain;      // 0 or 1

    // ==================== PRIVATE SIGNALS ===================
    signal input secret;
    signal input nullifier;
    signal input votes[maxCandidates]; // integer allocation per slot
    signal input blinding;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // ========================================================
    // C1 — numCandidates bounds: 2 <= numCandidates <= maxCandidates
    // ========================================================
    component numLower = GreaterEqThan(4);
    numLower.in[0] <== numCandidates;
    numLower.in[1] <== 2;
    numLower.out === 1;

    component numUpper = LessEqThan(4);
    numUpper.in[0] <== numCandidates;
    numUpper.in[1] <== maxCandidates;
    numUpper.out === 1;

    // ========================================================
    // C2 — totalVotes: 1 <= totalVotes <= 255 (fits in 8 bits)
    // ========================================================
    component tvBits = Num2Bits(8);
    tvBits.in <== totalVotes;          // proves totalVotes in [0, 255]

    component tvLower = GreaterEqThan(8);
    tvLower.in[0] <== totalVotes;
    tvLower.in[1] <== 1;
    tvLower.out === 1;

    // ========================================================
    // C3 — maxPerCandidate: 1 <= maxPerCandidate <= totalVotes
    // ========================================================
    component mpcBits = Num2Bits(8);
    mpcBits.in <== maxPerCandidate;

    component mpcLower = GreaterEqThan(8);
    mpcLower.in[0] <== maxPerCandidate;
    mpcLower.in[1] <== 1;
    mpcLower.out === 1;

    component mpcUpper = LessEqThan(8);
    mpcUpper.in[0] <== maxPerCandidate;
    mpcUpper.in[1] <== totalVotes;
    mpcUpper.out === 1;

    // ========================================================
    // C4 — allowAbstain is binary
    // ========================================================
    allowAbstain * (1 - allowAbstain) === 0;

    // ========================================================
    // C5 — Per-slot constraints:
    //   (a) Range proof: 0 <= votes[i] <= 255
    //   (b) Upper cap:   votes[i] <= maxPerCandidate
    //   (c) Invalid slot: votes[i] = 0 for i >= numCandidates
    // ========================================================
    component slotBits[maxCandidates];
    component slotCap[maxCandidates];
    component isValidSlot[maxCandidates];

    for (var i = 0; i < maxCandidates; i++) {
        // (a) Range: Num2Bits proves votes[i] >= 0 and fits in 8 bits
        slotBits[i] = Num2Bits(8);
        slotBits[i].in <== votes[i];

        // (b) Cap: votes[i] <= maxPerCandidate
        slotCap[i] = LessEqThan(8);
        slotCap[i].in[0] <== votes[i];
        slotCap[i].in[1] <== maxPerCandidate;
        slotCap[i].out === 1;

        // (c) Invalid slot must be zero
        isValidSlot[i] = LessThan(4);
        isValidSlot[i].in[0] <== i;           // compile-time constant
        isValidSlot[i].in[1] <== numCandidates; // runtime signal
        votes[i] * (1 - isValidSlot[i].out) === 0;
    }

    // ========================================================
    // C6 — allowAbstain gate: votes[0] = 0 when not allowed
    // ========================================================
    votes[0] * (1 - allowAbstain) === 0;

    // ========================================================
    // Compute sums (linear combinations — no extra constraints)
    // ========================================================
    signal realSum;
    realSum <== votes[1] + votes[2] + votes[3] + votes[4]
              + votes[5] + votes[6] + votes[7];

    signal totalUsed;
    totalUsed <== votes[0] + realSum;

    // ========================================================
    // C7 — Abstain exclusive: votes[0] * realSum = 0
    //      Either abstain (votes[0]>0) or vote real (realSum>0), not both
    // ========================================================
    votes[0] * realSum === 0;

    // ========================================================
    // C8 — Must use at least 1 vote (totalUsed >= 1)
    // ========================================================
    component atLeastOne = GreaterEqThan(8);
    atLeastOne.in[0] <== totalUsed;
    atLeastOne.in[1] <== 1;
    atLeastOne.out === 1;

    // ========================================================
    // C9 — Total votes used <= totalVotes budget
    // ========================================================
    component sumBound = LessEqThan(8);
    sumBound.in[0] <== totalUsed;
    sumBound.in[1] <== totalVotes;
    sumBound.out === 1;

    // ========================================================
    // C10 — Merkle membership: voter commitment in the tree
    // ========================================================
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;

    signal commitment;
    commitment <== commitmentHasher.out;

    component merkleProofVerifier = MerkleTreeChecker(levels);
    merkleProofVerifier.leaf <== commitment;
    merkleProofVerifier.root <== merkleRoot;
    for (var i = 0; i < levels; i++) {
        merkleProofVerifier.pathElements[i] <== pathElements[i];
        merkleProofVerifier.pathIndices[i]  <== pathIndices[i];
    }

    // ========================================================
    // C11 — Nullifier hash
    // ========================================================
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.out === nullifierHash;

    // ========================================================
    // C12 — Vote commitment = Poseidon(votes[0..7], blinding)
    // ========================================================
    component voteCommitHasher = Poseidon(9);
    for (var i = 0; i < 8; i++) {
        voteCommitHasher.inputs[i] <== votes[i];
    }
    voteCommitHasher.inputs[8] <== blinding;
    voteCommitHasher.out === voteCommitment;
}

// Public: merkleRoot, nullifierHash, voteCommitment,
//         numCandidates, totalVotes, maxPerCandidate, allowAbstain
component main {public [merkleRoot, nullifierHash, voteCommitment,
                        numCandidates, totalVotes, maxPerCandidate, allowAbstain]}
    = Vote(20, 8);
