pragma circom 2.0.0;

include "hasher.circom";
include "../node_modules/circomlib/circuits/switcher.circom";

template DualMux() {
    signal input in0;
    signal input in1;
    signal input sel;

    signal output outL;
    signal output outR;

    sel * (1 - sel) === 0;

    outL <== in0 + sel * (in1 - in0);
    outR <== in1 - sel * (in1 - in0);
}

template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component switchers[levels];
    component hashers[levels];

    signal currentHash[levels + 1];
    currentHash[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        switchers[i] = Switcher();
        switchers[i].L <== currentHash[i];
        switchers[i].R <== pathElements[i];
        switchers[i].sel <== pathIndices[i];

        hashers[i] = Hasher();
        hashers[i].left <== switchers[i].outL;
        hashers[i].right <== switchers[i].outR;

        currentHash[i + 1] <== hashers[i].hash;
    }

    root === currentHash[levels];
}

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

    isValid <== 1;
}
