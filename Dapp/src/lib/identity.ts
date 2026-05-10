/**
 * Voter identity: secret + nullifier + commitment + nullifierHash.
 *
 * Identity is generated client-side and never sent to the server. Backups are
 * exported as JSON for the user to keep safely (without it, they cannot vote
 * or reveal — by design).
 */
import { randomFieldElement } from './random'
import { getPoseidon } from './poseidon'

export type VoterIdentity = {
  secret: bigint
  nullifier: bigint
}

export type IdentityFile = {
  kind: 'zk-vote-identity'
  version: 1
  pool: string
  secret: string
  nullifier: string
  createdAt: string
  note?: string
}

export function newIdentity(): VoterIdentity {
  return {
    secret: randomFieldElement(),
    nullifier: randomFieldElement(),
  }
}

export async function commitmentOf(id: VoterIdentity): Promise<bigint> {
  const { hash2 } = await getPoseidon()
  return hash2([id.secret, id.nullifier])
}

export async function nullifierHashOf(id: VoterIdentity): Promise<bigint> {
  const { hash1 } = await getPoseidon()
  return hash1([id.secret])
}

export function identityToFile(id: VoterIdentity, pool: string, note?: string): IdentityFile {
  return {
    kind: 'zk-vote-identity',
    version: 1,
    pool,
    secret: id.secret.toString(),
    nullifier: id.nullifier.toString(),
    createdAt: new Date().toISOString(),
    note,
  }
}

export function identityFromFile(raw: unknown): VoterIdentity {
  const f = raw as Partial<IdentityFile>
  if (!f || f.kind !== 'zk-vote-identity') throw new Error('Not an identity file')
  if (!f.secret || !f.nullifier) throw new Error('Missing fields')
  return { secret: BigInt(f.secret), nullifier: BigInt(f.nullifier) }
}

/**
 * Vote ballot backup: stored locally so the voter can reveal during the reveal
 * phase even if they close their browser between vote and reveal.
 *
 * votes[8]: integer array — votes[0]=abstain weight, votes[1..7]=candidate weights.
 * blinding is deterministic (Poseidon(secret, pool)) — no separate backup needed.
 */
export type BallotBackup = {
  pool: string
  nullifierHash: string
  votes: number[]          // length 8, integer weights (0..totalVotes)
  blinding: string
  voteCommitment: string
  createdAt: string
}

const BACKUP_KEY = (pool: string) => `zk-vote-ballot:${pool.toLowerCase()}`

export function saveBallotBackup(b: BallotBackup) {
  localStorage.setItem(BACKUP_KEY(b.pool), JSON.stringify(b))
}

export function loadBallotBackup(pool: string): BallotBackup | null {
  const raw = localStorage.getItem(BACKUP_KEY(pool))
  if (!raw) return null
  try {
    return JSON.parse(raw) as BallotBackup
  } catch {
    return null
  }
}

export function clearBallotBackup(pool: string) {
  localStorage.removeItem(BACKUP_KEY(pool))
}
