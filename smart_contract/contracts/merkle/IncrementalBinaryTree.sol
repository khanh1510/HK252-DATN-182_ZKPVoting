// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Bn254Poseidon2} from "./PoseidonT3_Vendor.sol";

// Source: zk-kit incremental-merkle-tree.sol — Poseidon qua PoseidonAdapter

struct IncrementalTreeData {
    uint8 depth;
    uint256 root;
    uint256 numberOfLeaves;
    mapping(uint256 => uint256) zeroes;
    mapping(uint256 => uint256[2]) lastSubtrees;
}

library IncrementalBinaryTree {
    uint8 internal constant MAX_DEPTH = 32;
    uint256 internal constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    function init(IncrementalTreeData storage self, uint8 depth, uint256 zero) internal {
        require(zero < SNARK_SCALAR_FIELD, "IncrementalBinaryTree: leaf must be < SNARK_SCALAR_FIELD");
        require(depth > 0 && depth <= MAX_DEPTH, "IncrementalBinaryTree: tree depth must be between 1 and 32");

        self.depth = depth;

        for (uint8 i = 0; i < depth; i++) {
            self.zeroes[i] = zero;
            zero = Bn254Poseidon2.hash([zero, zero]);
        }

        self.root = zero;
    }

    function insert(IncrementalTreeData storage self, uint256 leaf) internal {
        require(leaf < SNARK_SCALAR_FIELD, "IncrementalBinaryTree: leaf must be < SNARK_SCALAR_FIELD");
        require(self.numberOfLeaves < 2 ** self.depth, "IncrementalBinaryTree: tree is full");

        uint256 index = self.numberOfLeaves;
        uint256 current = leaf;

        for (uint8 i = 0; i < self.depth; i++) {
            if (index % 2 == 0) {
                self.lastSubtrees[i] = [current, self.zeroes[i]];
            } else {
                self.lastSubtrees[i][1] = current;
            }

            current = Bn254Poseidon2.hash(
                [self.lastSubtrees[i][0], self.lastSubtrees[i][1]]
            );
            index /= 2;
        }

        self.root = current;
        self.numberOfLeaves += 1;
    }

}
