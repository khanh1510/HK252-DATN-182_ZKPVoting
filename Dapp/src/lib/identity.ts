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

// Stored in localStorage so the voter can reveal even after closing the browser
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
