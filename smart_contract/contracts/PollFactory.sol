// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VotingPool} from "./VotingPool.sol";
import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";

/**
 * @title PollFactory — Deploys VotingPool instances on demand
 * @notice One factory + one shared verifier. Each poll is its own VotingPool
 *         contract with isolated Merkle tree, nullifier set, and tallies.
 *         The caller of createPoll() becomes the owner (admin) of the new pool.
 */
contract PollFactory {
    /// @notice Shared PLONK verifier for every pool created by this factory.
    IGroth16Verifier public immutable verifier;

    struct PollInfo {
        address pool;
        address admin;
        VotingPool.EligibilityMode mode;
        string proposal;
        uint256 createdAt;
    }

    PollInfo[] private _polls;

    event PollCreated(
        uint256 indexed pollId,
        address indexed pool,
        address indexed admin,
        VotingPool.EligibilityMode mode,
        string proposal
    );

    constructor(address _verifier) {
        verifier = IGroth16Verifier(_verifier);
    }

    /**
     * @notice Deploy a new VotingPool. Caller becomes admin.
     */
    function createPoll(
        VotingPool.EligibilityMode mode,
        string calldata proposal,
        string[] calldata candidateNames,
        uint256 registrationDeadline,
        uint256 votingDeadline,
        uint256 revealDeadline,
        uint8   totalVotes,
        uint8   maxPerCandidate,
        bool    allowAbstain,
        bool    isWeighted
    ) external returns (uint256 pollId, address pool) {
        VotingPool p = new VotingPool(
            address(verifier),
            msg.sender,
            mode,
            proposal,
            candidateNames,
            registrationDeadline,
            votingDeadline,
            revealDeadline,
            totalVotes,
            maxPerCandidate,
            allowAbstain,
            isWeighted
        );

        pollId = _polls.length;
        _polls.push(PollInfo({
            pool: address(p),
            admin: msg.sender,
            mode: mode,
            proposal: proposal,
            createdAt: block.timestamp
        }));

        emit PollCreated(pollId, address(p), msg.sender, mode, proposal);
        return (pollId, address(p));
    }

    function pollCount() external view returns (uint256) {
        return _polls.length;
    }

    function getPoll(uint256 id) external view returns (PollInfo memory) {
        return _polls[id];
    }

    function getAllPolls() external view returns (PollInfo[] memory) {
        return _polls;
    }
}
