// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";

/**
 * @title MockGroth16Verifier — Test-only stub returning a fixed verdict.
 * @dev Replace with the real Groth16Verifier.sol exported by snarkjs in production.
 */
contract MockGroth16Verifier is IGroth16Verifier {
    bool public immutable alwaysValid;

    constructor(bool _alwaysValid) {
        alwaysValid = _alwaysValid;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) external view returns (bool) {
        return alwaysValid;
    }
}
