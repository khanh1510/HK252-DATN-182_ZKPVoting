pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template Hasher() {
    signal input left;
    signal input right;
    signal output hash;

    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== left;
    poseidon.inputs[1] <== right;

    hash <== poseidon.out;
}

template CommitmentHasher() {
    signal input secret;
    signal input nullifier;

    signal output commitment;

    component commitmentPoseidon = Poseidon(2);
    commitmentPoseidon.inputs[0] <== secret;
    commitmentPoseidon.inputs[1] <== nullifier;

    commitment <== commitmentPoseidon.out;
}
