// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IncrementalBinaryTree, IncrementalTreeData} from "./merkle/IncrementalBinaryTree.sol";
import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title VotingPool
 * @notice Anonymous voting contract using Groth16 ZK proofs and commit-reveal.
 * Voting type is set at creation via totalVotes + maxPerCandidate:
 * (1,1) = single choice; (K,1) = multiple choice; (N,N) = cumulative.
 */
contract VotingPool is Ownable, EIP712 {
    using IncrementalBinaryTree for IncrementalTreeData;


    uint8   public constant DEPTH          = 20;
    uint8   public constant MAX_CANDIDATES = 8;

    bytes32 public constant VOTER_APPROVAL_TYPEHASH = keccak256(
        "VoterApproval(address voter,address pool,uint256 deadline)"
    );


    enum EligibilityMode { OPEN, ADMIN_APPROVED }
    enum Phase           { Registration, Voting, Reveal, Ended }


    IGroth16Verifier public immutable verifier;
    EligibilityMode  public immutable mode;

    uint8  public immutable realCandidates;   // real options (excl. abstain at 0)
    uint8  public immutable totalVotes;        // voting power per voter (1..255)
    uint8  public immutable maxPerCandidate;   // max votes for any single slot
    bool   public immutable allowAbstain;
    bool   public immutable isWeighted;        // true = weight multiplier per voter

    string   public proposal;
    string[] private _candidateNames;


    IncrementalTreeData internal _tree;

    mapping(address  => bool)    public hasRegistered;
    mapping(bytes32  => bool)    public usedApproval;
    mapping(uint256  => bool)    public nullifierUsed;
    mapping(uint256  => uint256) public voteCommitmentOf;
    mapping(uint256  => bool)    public revealed;
    /// @notice Voter weight per nullifierHash (only used when isWeighted=true). Default=1.
    mapping(uint256  => uint256) public voterWeight;

    uint256[MAX_CANDIDATES] private _voteCounts;
    uint256 public totalVotesCast;
    uint256 public totalRevealed;

    uint256 public registrationDeadline;
    uint256 public votingDeadline;
    uint256 public revealDeadline;
    Phase   public currentPhase;


    event LeafInserted(uint256 indexed leafIndex, uint256 commitment, uint256 newRoot);
    event VoterRegistered(uint256 indexed leafIndex, uint256 indexed nullifierHash);
    event WeightAssigned(uint256 indexed nullifierHash, uint256 weight);
    event VoteCast(uint256 indexed nullifierHash, uint256 voteCommitment);
    event VoteRevealed(uint256 indexed nullifierHash, uint256[8] votes);
    event PhaseChanged(Phase oldPhase, Phase newPhase);


    error InvalidPhase();
    error DeadlineExpired();
    error AlreadyRegistered();
    error InvalidApproval();
    error ApprovalExpired();
    error ApprovalAlreadyUsed();
    error InvalidProof();
    error MerkleRootMismatch();
    error NumCandidatesMismatch();
    error TotalVotesMismatch();
    error MaxPerCandidateMismatch();
    error AllowAbstainMismatch();
    error DoubleVote();
    error AlreadyRevealed();
    error CommitmentMismatch();
    error InvalidVotes();
    error ResultsNotAvailable();
    error InvalidPhaseTransition();
    error InvalidConfig();
    error NotWeightedPoll();


    constructor(
        address         _verifier,
        address         _admin,
        EligibilityMode _mode,
        string memory   _proposal,
        string[] memory _candidateNames_,
        uint256         _registrationDeadline,
        uint256         _votingDeadline,
        uint256         _revealDeadline,
        uint8           _totalVotes,
        uint8           _maxPerCandidate,
        bool            _allowAbstain,
        bool            _isWeighted
    )
        Ownable(_admin)
        EIP712("VotingPool", "1")
    {
        if (_candidateNames_.length == 0 || _candidateNames_.length >= MAX_CANDIDATES)
            revert InvalidConfig();
        if (_totalVotes == 0)
            revert InvalidConfig();
        if (_maxPerCandidate == 0 || _maxPerCandidate > _totalVotes)
            revert InvalidConfig();
        if (_registrationDeadline >= _votingDeadline) revert InvalidConfig();
        if (_votingDeadline       >= _revealDeadline) revert InvalidConfig();

        verifier         = IGroth16Verifier(_verifier);
        mode             = _mode;
        proposal         = _proposal;
        realCandidates   = uint8(_candidateNames_.length);
        totalVotes       = _totalVotes;
        maxPerCandidate  = _maxPerCandidate;
        allowAbstain     = _allowAbstain;
        isWeighted       = _isWeighted;

        _candidateNames.push("Abstain");
        for (uint256 i = 0; i < _candidateNames_.length; ++i) {
            _candidateNames.push(_candidateNames_[i]);
        }

        registrationDeadline = _registrationDeadline;
        votingDeadline       = _votingDeadline;
        revealDeadline       = _revealDeadline;

        _tree.init(DEPTH, 0);
        currentPhase = Phase.Registration;
    }


    // nullifierHash only used for weighted polls so admin can call setWeight(); pass 0 otherwise
    function register(
        uint256 commitment,
        uint256 nullifierHash,
        bytes calldata adminSig,
        uint256 sigDeadline
    ) external returns (uint256 leafIndex) {
        if (currentPhase != Phase.Registration) revert InvalidPhase();
        if (block.timestamp > registrationDeadline) revert DeadlineExpired();
        if (hasRegistered[msg.sender]) revert AlreadyRegistered();

        if (mode == EligibilityMode.ADMIN_APPROVED) {
            _verifyAdminApproval(msg.sender, adminSig, sigDeadline);
        }

        hasRegistered[msg.sender] = true;
        leafIndex = _tree.numberOfLeaves;
        _tree.insert(commitment);
        emit LeafInserted(leafIndex, commitment, _tree.root);

        // Emit nullifierHash for weighted polls so admin can assign weight
        if (isWeighted && nullifierHash != 0) {
            emit VoterRegistered(leafIndex, nullifierHash);
        }
    }

    function setWeight(uint256 nullifierHash, uint256 weight) external onlyOwner {
        if (!isWeighted) revert NotWeightedPoll();
        if (weight == 0) weight = 1;
        voterWeight[nullifierHash] = weight;
        emit WeightAssigned(nullifierHash, weight);
    }

    function _verifyAdminApproval(
        address voter,
        bytes calldata sig,
        uint256 sigDeadline
    ) internal {
        if (block.timestamp > sigDeadline) revert ApprovalExpired();
        bytes32 structHash = keccak256(
            abi.encode(VOTER_APPROVAL_TYPEHASH, voter, address(this), sigDeadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (usedApproval[digest]) revert ApprovalAlreadyUsed();
        usedApproval[digest] = true;
        address signer = ECDSA.recover(digest, sig);
        if (signer != owner()) revert InvalidApproval();
    }


    function castVote(
        uint256[2]    calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2]    calldata _pC,
        uint256[7]    calldata _pubSignals
    ) external {
        if (currentPhase != Phase.Voting) revert InvalidPhase();
        if (block.timestamp > votingDeadline) revert DeadlineExpired();

        if (_pubSignals[0] != _tree.root)                          revert MerkleRootMismatch();
        if (_pubSignals[3] != uint256(realCandidates) + 1)         revert NumCandidatesMismatch();
        if (_pubSignals[4] != uint256(totalVotes))                  revert TotalVotesMismatch();
        if (_pubSignals[5] != uint256(maxPerCandidate))             revert MaxPerCandidateMismatch();
        if (_pubSignals[6] != (allowAbstain ? 1 : 0))              revert AllowAbstainMismatch();

        uint256 nf = _pubSignals[1];
        if (nullifierUsed[nf]) revert DoubleVote();

        if (!verifier.verifyProof(_pA, _pB, _pC, _pubSignals)) revert InvalidProof();

        nullifierUsed[nf]    = true;
        voteCommitmentOf[nf] = _pubSignals[2];
        unchecked { ++totalVotesCast; }

        emit VoteCast(nf, _pubSignals[2]);
    }


    function revealVote(
        uint256      nullifierHash,
        uint256[8] calldata votes,
        uint256      expectedCommit
    ) external {
        if (currentPhase != Phase.Reveal)     revert InvalidPhase();
        if (block.timestamp > revealDeadline) revert DeadlineExpired();
        if (revealed[nullifierHash])          revert AlreadyRevealed();
        if (!nullifierUsed[nullifierHash])    revert DoubleVote();
        if (voteCommitmentOf[nullifierHash] != expectedCommit) revert CommitmentMismatch();

        // Extra checks — ZK proof already enforces these, but verify on-chain anyway

        uint256 abstainVotes = votes[0];
        uint256 realSum      = 0;

        if (abstainVotes > uint256(maxPerCandidate)) revert InvalidVotes();

        for (uint256 i = 1; i <= uint256(realCandidates); i++) {
            if (votes[i] > uint256(maxPerCandidate)) revert InvalidVotes();
            realSum += votes[i];
        }

        if (abstainVotes > 0 && !allowAbstain)          revert InvalidVotes();
        if (abstainVotes > 0 && realSum > 0)             revert InvalidVotes(); // exclusive
        if (abstainVotes + realSum == 0)                 revert InvalidVotes(); // must vote
        if (abstainVotes + realSum > uint256(totalVotes)) revert InvalidVotes();

        // ── Accumulate votes × weight ──
        uint256 weight = isWeighted ? voterWeight[nullifierHash] : 1;
        if (weight == 0) weight = 1; // default weight = 1 if admin didn't set

        revealed[nullifierHash] = true;
        for (uint256 i = 0; i <= uint256(realCandidates); i++) {
            if (votes[i] > 0) {
                unchecked { _voteCounts[i] += votes[i] * weight; }
            }
        }
        unchecked { ++totalRevealed; }

        emit VoteRevealed(nullifierHash, votes);
    }


    function startVoting() external onlyOwner {
        if (currentPhase != Phase.Registration) revert InvalidPhaseTransition();
        _setPhase(Phase.Voting);
    }

    function startReveal() external onlyOwner {
        if (currentPhase != Phase.Voting) revert InvalidPhaseTransition();
        _setPhase(Phase.Reveal);
    }

    function endPoll() external onlyOwner {
        if (currentPhase != Phase.Reveal) revert InvalidPhaseTransition();
        _setPhase(Phase.Ended);
    }

    function _setPhase(Phase newPhase) internal {
        Phase old = currentPhase;
        currentPhase = newPhase;
        emit PhaseChanged(old, newPhase);
    }


    function currentPhaseActual() public view returns (Phase) {
        if (currentPhase == Phase.Registration && block.timestamp > registrationDeadline) return Phase.Voting;
        if (currentPhase == Phase.Voting       && block.timestamp > votingDeadline)       return Phase.Reveal;
        if (currentPhase == Phase.Reveal       && block.timestamp > revealDeadline)       return Phase.Ended;
        return currentPhase;
    }

    function getResults() external view returns (uint256[] memory counts) {
        if (currentPhaseActual() != Phase.Ended) revert ResultsNotAvailable();
        counts = new uint256[](uint256(realCandidates) + 1);
        for (uint256 i = 0; i < counts.length; ++i) counts[i] = _voteCounts[i];
    }

    function getRoot()           external view returns (uint256)         { return _tree.root; }
    function getNumberOfLeaves() external view returns (uint256)         { return _tree.numberOfLeaves; }
    function getCandidates()     external view returns (string[] memory) { return _candidateNames; }
    function domainSeparator()   external view returns (bytes32)         { return _domainSeparatorV4(); }
}
