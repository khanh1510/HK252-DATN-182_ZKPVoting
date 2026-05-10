pragma circom 2.0.0;

/*
 * ===================================================================================
 * HASHER.CIRCOM — Hash Function Components
 * ===================================================================================
 *
 * This file provides hash-related templates based on the Poseidon hash function.
 * Poseidon is chosen due to its efficiency and suitability for ZK-SNARK circuits.
 *
 * ===================================================================================
 */

include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * -----------------------------------------------------------------------------
 * Hasher
 * -----------------------------------------------------------------------------
 * Hashes two field elements into one using the Poseidon hash function.
 *
 * hash = Poseidon(left, right)
 *
 * Inputs:
 *   - left:  Left input value
 *   - right: Right input value
 *
 * Output:
 *   - hash: Poseidon hash of (left, right)
 * -----------------------------------------------------------------------------
 */
template Hasher() {
    signal input left;
    signal input right;
    signal output hash;

    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== left;
    poseidon.inputs[1] <== right;

    hash <== poseidon.out;
}

/*
 * -----------------------------------------------------------------------------
 * CommitmentHasher
 * -----------------------------------------------------------------------------
 * Computes a commitment from a secret and a nullifier.
 *
 * commitment = Poseidon(secret, nullifier)
 *
 * The commitment is typically stored as a leaf in a Merkle tree.
 *
 * Inputs:
 *   - secret:    Private secret of the voter
 *   - nullifier: Value used to prevent double voting
 *
 * Outputs:
 *   - commitment: Poseidon hash of (secret, nullifier)
 * -----------------------------------------------------------------------------
 */
template CommitmentHasher() {
    signal input secret;
    signal input nullifier;

    signal output commitment;

    component commitmentPoseidon = Poseidon(2);
    commitmentPoseidon.inputs[0] <== secret;
    commitmentPoseidon.inputs[1] <== nullifier;

    commitment <== commitmentPoseidon.out;
}
