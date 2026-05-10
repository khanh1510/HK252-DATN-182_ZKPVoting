pragma circom 2.0.0;

/*
 * ===================================================================================
 * MERKLE_TREE.CIRCOM — Merkle Tree Verification Components
 * ===================================================================================
 *
 * This file provides templates for verifying Merkle inclusion proofs in ZK-SNARKs.
 *
 * A Merkle tree enables:
 *   - Storage of N elements in O(N) space
 *   - Membership proofs in O(log N) time
 *   - Efficient updates in O(log N) time
 *
 * In the voting system:
 *   - Leaf  = voter commitment
 *   - Merkle proof demonstrates eligibility without revealing identity
 *
 * ===================================================================================
 */

include "hasher.circom";
include "../node_modules/circomlib/circuits/switcher.circom";

/*
 * -----------------------------------------------------------------------------
 * DualMux
 * -----------------------------------------------------------------------------
 * Selects the order of two values based on a binary selector.
 *
 * If sel = 0:
 *   outL = in0, outR = in1  (keep order)
 *
 * If sel = 1:
 *   outL = in1, outR = in0  (swap order)
 *
 * This is used to determine left/right positioning in the Merkle tree.
 *
 * Inputs:
 *   - in0: First input value
 *   - in1: Second input value
 *   - sel: Selector (must be 0 or 1)
 *
 * Outputs:
 *   - outL: Left output
 *   - outR: Right output
 * -----------------------------------------------------------------------------
 */
template DualMux() {
    signal input in0;
    signal input in1;
    signal input sel;

    signal output outL;
    signal output outR;

    // Enforce sel to be binary
    sel * (1 - sel) === 0;

    outL <== in0 + sel * (in1 - in0);
    outR <== in1 - sel * (in1 - in0);
}

/*
 * -----------------------------------------------------------------------------
 * MerkleTreeChecker
 * -----------------------------------------------------------------------------
 * Verifies a Merkle inclusion proof.
 *
 * Starting from a leaf, hashes upward level-by-level using the provided
 * path elements and path indices, and enforces that the final hash equals
 * the public Merkle root.
 *
 * Inputs:
 *   - leaf:         Commitment value (leaf)
 *   - root:         Public Merkle root
 *   - pathElements: Sibling nodes for each level
 *   - pathIndices:  Position bits (0 = left, 1 = right)
 * -----------------------------------------------------------------------------
 */
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component switchers[levels];
    component hashers[levels];

    // Hash value at each level
    signal currentHash[levels + 1];
    currentHash[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // Select left/right ordering based on pathIndices[i]
        switchers[i] = Switcher();
        switchers[i].L <== currentHash[i];
        switchers[i].R <== pathElements[i];
        switchers[i].sel <== pathIndices[i];

        hashers[i] = Hasher();
        hashers[i].left <== switchers[i].outL;
        hashers[i].right <== switchers[i].outR;

        // Compute hash for next level
        currentHash[i + 1] <== hashers[i].hash;
    }

    // Enforce computed root equals the public root
    root === currentHash[levels];
}

/*
 * -----------------------------------------------------------------------------
 * MerkleTreeInclusionProof
 * -----------------------------------------------------------------------------
 * Lightweight wrapper around MerkleTreeChecker.
 *
 * This template can be embedded in larger circuits where a boolean-style
 * inclusion proof is conceptually useful.
 *
 * Note:
 *   The proof is valid if and only if all constraints are satisfied.
 *   The output signal `isValid` is always set to 1 when constraints hold.
 * -----------------------------------------------------------------------------
 */
template MerkleTreeInclusionProof(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal output isValid;

    component checker = MerkleTreeChecker(levels);
    checker.leaf <== leaf;
    checker.root <== root;

    for (var i = 0; i < levels; i++) {
        checker.pathElements[i] <== pathElements[i];
        checker.pathIndices[i] <== pathIndices[i];
    }

    // If all constraints are satisfied, the proof is valid
    isValid <== 1;
}
