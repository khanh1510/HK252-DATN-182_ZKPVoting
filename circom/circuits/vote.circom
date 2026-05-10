pragma circom 2.0.0;

// votes[0] = abstain slot; votes[1..numCandidates-1] = real candidates
// votes[0] > 0 is exclusive with sum(votes[1..]) > 0

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

    // C1: 2 <= numCandidates <= maxCandidates
    component numLower = GreaterEqThan(4);
    numLower.in[0] <== numCandidates;
    numLower.in[1] <== 2;
    numLower.out === 1;

    component numUpper = LessEqThan(4);
    numUpper.in[0] <== numCandidates;
    numUpper.in[1] <== maxCandidates;
    numUpper.out === 1;

    // C2: 1 <= totalVotes <= 255
    component tvBits = Num2Bits(8);
    tvBits.in <== totalVotes;

    component tvLower = GreaterEqThan(8);
    tvLower.in[0] <== totalVotes;
    tvLower.in[1] <== 1;
    tvLower.out === 1;

    // C3: 1 <= maxPerCandidate <= totalVotes
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

    // C4: allowAbstain is binary
    allowAbstain * (1 - allowAbstain) === 0;

    // C5: per-slot range, cap, and zero-out-of-bounds
    component slotBits[maxCandidates];
    component slotCap[maxCandidates];
    component isValidSlot[maxCandidates];

    for (var i = 0; i < maxCandidates; i++) {
        slotBits[i] = Num2Bits(8);
        slotBits[i].in <== votes[i];

        slotCap[i] = LessEqThan(8);
        slotCap[i].in[0] <== votes[i];
        slotCap[i].in[1] <== maxPerCandidate;
        slotCap[i].out === 1;

        isValidSlot[i] = LessThan(4);
        isValidSlot[i].in[0] <== i;
        isValidSlot[i].in[1] <== numCandidates;
        votes[i] * (1 - isValidSlot[i].out) === 0;
    }

    // C6: votes[0] must be 0 if abstain not allowed
    votes[0] * (1 - allowAbstain) === 0;

    signal realSum;
    realSum <== votes[1] + votes[2] + votes[3] + votes[4]
              + votes[5] + votes[6] + votes[7];

    signal totalUsed;
    totalUsed <== votes[0] + realSum;

    // C7: abstain and real votes are mutually exclusive
    votes[0] * realSum === 0;

    // C8: at least one vote must be cast
    component atLeastOne = GreaterEqThan(8);
    atLeastOne.in[0] <== totalUsed;
    atLeastOne.in[1] <== 1;
    atLeastOne.out === 1;

    // C9: totalUsed <= totalVotes budget
    component sumBound = LessEqThan(8);
    sumBound.in[0] <== totalUsed;
    sumBound.in[1] <== totalVotes;
    sumBound.out === 1;

    // C10: commitment = Poseidon(secret, nullifier) is in the Merkle tree
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

    // C11: nullifierHash = Poseidon(secret)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.out === nullifierHash;

    // C12: voteCommitment = Poseidon(votes[0..7], blinding)
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
