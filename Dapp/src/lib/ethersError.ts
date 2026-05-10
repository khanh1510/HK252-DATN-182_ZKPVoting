// Known custom error selectors (first 4 bytes of keccak256 of signature)
const KNOWN_ERRORS: Record<string, string> = {
  '0x35be3ac8': 'InvalidConfig() — kiểm tra số lựa chọn, totalVotes, maxPerCandidate, hoặc deadline',
  '0x9a36fd9c': 'InvalidPhase() — sai phase cho hành động này',
  '0xfdebb480': 'DoubleVote() — nullifier đã được sử dụng',
  '0x1ab7da6b': 'DeadlineExpired() — deadline đã qua',
  '0x3a81d6fc': 'AlreadyRegistered() — địa chỉ đã đăng ký',
  '0x09bde339': 'InvalidProof() — ZK proof không hợp lệ',
  '0x0432f01c': 'MerkleRootMismatch() — merkle root không khớp',
  '0x5054097b': 'CommitmentMismatch() — vote commitment không khớp',
  '0xee0f95e0': 'InvalidVotes() — phân bổ phiếu không hợp lệ',
  '0x298f1942': 'TotalVotesMismatch() — totalVotes không khớp với contract',
  '0x0d8201c1': 'MaxPerCandidateMismatch() — maxPerCandidate không khớp',
  '0x0f7e3882': 'AllowAbstainMismatch() — allowAbstain không khớp',
  '0x6cd64e13': 'NumCandidatesMismatch() — numCandidates không khớp',
}

/** Chuỗi lỗi dễ đọc từ ethers / RPC */
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
