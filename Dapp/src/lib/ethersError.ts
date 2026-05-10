// First 4 bytes of keccak256 of each custom error signature
const KNOWN_ERRORS: Record<string, string> = {
  '0x35be3ac8': 'InvalidConfig() — check candidate count, totalVotes, maxPerCandidate, or deadlines',
  '0x9a36fd9c': 'InvalidPhase() — action not allowed in current phase',
  '0xfdebb480': 'DoubleVote() — nullifier already used',
  '0x1ab7da6b': 'DeadlineExpired() — phase deadline has passed',
  '0x3a81d6fc': 'AlreadyRegistered() — address already registered',
  '0x09bde339': 'InvalidProof() — ZK proof verification failed',
  '0x0432f01c': 'MerkleRootMismatch() — merkle root does not match on-chain state',
  '0x5054097b': 'CommitmentMismatch() — vote commitment does not match stored value',
  '0xee0f95e0': 'InvalidVotes() — vote allocation is invalid',
  '0x298f1942': 'TotalVotesMismatch() — totalVotes does not match contract',
  '0x0d8201c1': 'MaxPerCandidateMismatch() — maxPerCandidate does not match contract',
  '0x0f7e3882': 'AllowAbstainMismatch() — allowAbstain flag does not match contract',
  '0x6cd64e13': 'NumCandidatesMismatch() — numCandidates does not match contract',
}

export function formatContractError(e: unknown): string {
  if (e instanceof Error) {
    const any = e as Error & {
      reason?: string
      shortMessage?: string
      data?: string
      info?: { error?: { message?: string; data?: string } }
    }

    // Try to decode custom error from raw data
    const rawData = any.data || any.info?.error?.data || ''
    if (rawData && rawData.length >= 10) {
      const selector = rawData.slice(0, 10).toLowerCase()
      if (KNOWN_ERRORS[selector]) return KNOWN_ERRORS[selector]
      return `Contract revert (selector: ${selector}) — check Arbiscan for details`
    }

    if (any.reason) return any.reason
    if (any.shortMessage && any.shortMessage !== 'could not coalesce error')
      return any.shortMessage
    if (any.info?.error?.message) return any.info.error.message
    return any.message
  }
  return String(e)
}
