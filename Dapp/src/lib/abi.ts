/**
 * ABI — keep in sync with evm/contracts/*.sol
 *
 * Universal voting circuit public signals (7):
 *   [merkleRoot, nullifierHash, voteCommitment,
 *    numCandidates, totalVotes, maxPerCandidate, allowAbstain]
 */

export const FACTORY_ABI = [
  'function createPoll(uint8 mode, string proposal, string[] candidateNames, uint256 registrationDeadline, uint256 votingDeadline, uint256 revealDeadline, uint8 totalVotes, uint8 maxPerCandidate, bool allowAbstain, bool isWeighted) external returns (uint256 pollId, address pool)',
  'function pollCount() external view returns (uint256)',
  'function getPoll(uint256 id) external view returns (tuple(address pool, address admin, uint8 mode, string proposal, uint256 createdAt))',
  'function getAllPolls() external view returns (tuple(address pool, address admin, uint8 mode, string proposal, uint256 createdAt)[])',
  'event PollCreated(uint256 indexed pollId, address indexed pool, address indexed admin, uint8 mode, string proposal)',
] as const

export const POOL_ABI = [
  // config
  'function mode() external view returns (uint8)',
  'function proposal() external view returns (string)',
  'function realCandidates() external view returns (uint8)',
  'function totalVotes() external view returns (uint8)',
  'function maxPerCandidate() external view returns (uint8)',
  'function allowAbstain() external view returns (bool)',
  'function isWeighted() external view returns (bool)',
  'function voterWeight(uint256 nullifierHash) external view returns (uint256)',
  'function getCandidates() external view returns (string[])',
  'function registrationDeadline() external view returns (uint256)',
  'function votingDeadline() external view returns (uint256)',
  'function revealDeadline() external view returns (uint256)',
  'function currentPhase() external view returns (uint8)',
  'function currentPhaseActual() external view returns (uint8)',
  'function owner() external view returns (address)',
  'function domainSeparator() external view returns (bytes32)',

  // merkle
  'function getRoot() external view returns (uint256)',
  'function getNumberOfLeaves() external view returns (uint256)',
  'function hasRegistered(address) external view returns (bool)',

  // vote state
  'function nullifierUsed(uint256) external view returns (bool)',
  'function voteCommitmentOf(uint256) external view returns (uint256)',
  'function revealed(uint256) external view returns (bool)',
  'function totalVotesCast() external view returns (uint256)',
  'function totalRevealed() external view returns (uint256)',
  'function getResults() external view returns (uint256[])',

  // mutating
  'function register(uint256 commitment, uint256 nullifierHash, bytes adminSig, uint256 sigDeadline) external returns (uint256)',
  'function setWeight(uint256 nullifierHash, uint256 weight) external',
  'function castVote(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[7] _pubSignals) external',
  'function revealVote(uint256 nullifierHash, uint256[8] votes, uint256 expectedCommit) external',
  'function startVoting() external',
  'function startReveal() external',
  'function endPoll() external',

  // events
  'event LeafInserted(uint256 indexed leafIndex, uint256 commitment, uint256 newRoot)',
  'event VoterRegistered(uint256 indexed leafIndex, uint256 indexed nullifierHash)',
  'event WeightAssigned(uint256 indexed nullifierHash, uint256 weight)',
  'event VoteCast(uint256 indexed nullifierHash, uint256 voteCommitment)',
  'event VoteRevealed(uint256 indexed nullifierHash, uint256[8] votes)',
  'event PhaseChanged(uint8 oldPhase, uint8 newPhase)',
] as const

export const ELIGIBILITY_MODE = { OPEN: 0, ADMIN_APPROVED: 1 } as const
export type EligibilityMode = (typeof ELIGIBILITY_MODE)[keyof typeof ELIGIBILITY_MODE]

export const PHASE = { Registration: 0, Voting: 1, Reveal: 2, Ended: 3 } as const
export type Phase = (typeof PHASE)[keyof typeof PHASE]

export const PHASE_LABEL: Record<Phase, string> = {
  0: 'Registration', 1: 'Voting', 2: 'Reveal', 3: 'Ended',
}
