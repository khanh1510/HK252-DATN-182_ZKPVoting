import type { Signer } from 'ethers'

export const VOTER_APPROVAL_TYPES = {
  VoterApproval: [
    { name: 'voter', type: 'address' },
    { name: 'pool', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
}

export type VoterApproval = {
  voter: string
  pool: string
  deadline: bigint
}

export function buildDomain(chainId: number | bigint, pool: string) {
  return {
    name: 'VotingPool',
    version: '1',
    chainId: BigInt(chainId),
    verifyingContract: pool,
  }
}

export async function signVoterApproval(
  signer: Signer,
  chainId: number | bigint,
  pool: string,
  approval: VoterApproval,
): Promise<string> {
  const domain = buildDomain(chainId, pool)
  return await signer.signTypedData(domain, VOTER_APPROVAL_TYPES, approval)
}

export type ApprovalCoupon = {
  voter: string
  pool: string
  deadline: string
  signature: string
}

export function packCoupon(approval: VoterApproval, signature: string): ApprovalCoupon {
  return {
    voter: approval.voter,
    pool: approval.pool,
    deadline: approval.deadline.toString(),
    signature,
  }
}

export function parseCoupon(s: string): ApprovalCoupon {
  const obj = JSON.parse(s) as Partial<ApprovalCoupon>
  if (!obj.voter || !obj.pool || !obj.deadline || !obj.signature) {
    throw new Error('Invalid coupon')
  }
  return obj as ApprovalCoupon
}
