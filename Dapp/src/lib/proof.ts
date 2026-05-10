import type { IncrementalMerkleTree } from '@zk-kit/incremental-merkle-tree'
import { appConfig } from '@/config'
import { getPoseidon } from './poseidon'

declare global {
  interface Window { snarkjs?: typeof import('snarkjs') }
}

async function loadSnarkjs(): Promise<typeof import('snarkjs')> {
  try { return (await import('snarkjs')) as unknown as typeof import('snarkjs') }
  catch {
    if (window.snarkjs) return window.snarkjs
    throw new Error('snarkjs not available')
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type VotingMode = 'single' | 'multiple' | 'cumulative'

export function detectMode(totalVotes: number, maxPerCandidate: number): VotingMode {
  if (maxPerCandidate === 1 && totalVotes === 1) return 'single'
  if (maxPerCandidate === 1) return 'multiple'
  return 'cumulative'
}

export type CircuitInput = {
  // Public
  merkleRoot:      string
  nullifierHash:   string
  voteCommitment:  string
  numCandidates:   string
  totalVotes:      string
  maxPerCandidate: string
  allowAbstain:    string
  // Private
  secret:          string
  nullifier:       string
  votes:           string[]   // length 8, integers as strings
  blinding:        string
  pathElements:    string[]
  pathIndices:     string[]
}

export type BuildInputArgs = {
  chainRoot:       bigint
  secret:          bigint
  nullifier:       bigint
  /** votes[i] = integer weight for slot i (0 = abstain slot) */
  votes:           number[]
  numCandidates:   bigint
  totalVotes:      bigint
  maxPerCandidate: bigint
  allowAbstain:    boolean
  pool:            string
  tree:            IncrementalMerkleTree
  leafIndex:       number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function deriveBlinding(secret: bigint, pool: string): Promise<bigint> {
  const { hashN } = await getPoseidon()
  return hashN([secret, BigInt(pool)])
}

function buildVotes8(votes: number[]): bigint[] {
  const out = Array(8).fill(0n)
  for (let i = 0; i < Math.min(votes.length, 8); i++) out[i] = BigInt(votes[i])
  return out
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildCircuitInput(args: BuildInputArgs): Promise<CircuitInput> {
  const { hashN } = await getPoseidon()

  const nullifierHash = hashN([args.secret])
  const blinding      = await deriveBlinding(args.secret, args.pool)
  const votes8        = buildVotes8(args.votes)

  // voteCommitment = Poseidon(votes[0..7], blinding)
  const voteCommitment = hashN([...votes8, blinding])

  const proof        = args.tree.createProof(args.leafIndex)
  const pathElements = proof.siblings.map((s: bigint[]) => s[0].toString())
  const pathIndices  = proof.pathIndices.map((x: number | bigint) => x.toString())

  return {
    merkleRoot:      args.chainRoot.toString(),
    nullifierHash:   nullifierHash.toString(),
    voteCommitment:  voteCommitment.toString(),
    numCandidates:   args.numCandidates.toString(),
    totalVotes:      args.totalVotes.toString(),
    maxPerCandidate: args.maxPerCandidate.toString(),
    allowAbstain:    args.allowAbstain ? '1' : '0',
    secret:          args.secret.toString(),
    nullifier:       args.nullifier.toString(),
    votes:           votes8.map(String),
    blinding:        blinding.toString(),
    pathElements,
    pathIndices,
  }
}

// ─── Proof ────────────────────────────────────────────────────────────────────

export type Groth16ProofShape = { pi_a: string[]; pi_b: string[][]; pi_c: string[] }

export type CastVoteArgs = {
  pA: [string, string]
  pB: [[string, string], [string, string]]
  pC: [string, string]
  pubSignals: string[]   // 7 elements
}

export type GeneratedProof = CastVoteArgs

export function proofToCastVoteArgs(proof: Groth16ProofShape, publicSignals: string[]): CastVoteArgs {
  return {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
    pC: [proof.pi_c[0], proof.pi_c[1]],
    pubSignals: publicSignals,
  }
}

export async function generateVoteProof(input: CircuitInput): Promise<GeneratedProof> {
  if (appConfig.useDummyProof) {
    return {
      pA: ['0', '0'], pB: [['0', '0'], ['0', '0']], pC: ['0', '0'],
      pubSignals: [
        input.merkleRoot, input.nullifierHash, input.voteCommitment,
        input.numCandidates, input.totalVotes, input.maxPerCandidate, input.allowAbstain,
      ],
    }
  }
  const snarkjs = await loadSnarkjs()
  const { proof, publicSignals } = await (snarkjs as {
    groth16: {
      fullProve: (input: unknown, wasm: string, zkey: string) =>
        Promise<{ proof: Groth16ProofShape; publicSignals: string[] }>
    }
  }).groth16.fullProve(input, appConfig.zkWasmUrl, appConfig.zkZkeyUrl)
  return proofToCastVoteArgs(proof, publicSignals)
}
