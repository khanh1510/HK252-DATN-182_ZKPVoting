/**
 * Reconstruct the on-chain Merkle tree from LeafInserted events,
 * so we can build inclusion proofs for the circuit.
 */
import { Contract } from 'ethers'
import { IncrementalMerkleTree } from '@zk-kit/incremental-merkle-tree'
import { POOL_ABI } from './abi'
import { getPoseidon } from './poseidon'
import { appConfig } from '@/config'

export type SyncedTree = {
  tree: IncrementalMerkleTree
  /** map commitment(string) → leaf index */
  indexByCommitment: Map<string, number>
}

export const TREE_DEPTH = 20

export async function syncTree(
  poolAddress: string,
  provider: import('ethers').Provider,
  fromBlock?: number,
): Promise<SyncedTree> {
  const { hash2 } = await getPoseidon()
  const tree = new IncrementalMerkleTree(
    (e: unknown[]) => hash2(e as bigint[]),
    TREE_DEPTH,
    BigInt(0),
    2,
    [],
  )

  const pool = new Contract(poolAddress, POOL_ABI, provider)
  const filter = pool.filters.LeafInserted()
  const logs = await pool.queryFilter(filter, fromBlock ?? appConfig.deploymentBlock, 'latest')

  // Sort by leafIndex ascending in case logs come out of order.
  const sorted = logs.slice().sort((a, b) => {
    const ai = Number((a as unknown as { args: { leafIndex: bigint } }).args.leafIndex)
    const bi = Number((b as unknown as { args: { leafIndex: bigint } }).args.leafIndex)
    return ai - bi
  })

  const indexByCommitment = new Map<string, number>()
  for (const log of sorted) {
    const args = (log as unknown as { args: { commitment: bigint; leafIndex: bigint } }).args
    const commitment = args.commitment
    const idx = Number(args.leafIndex)
    tree.insert(commitment)
    indexByCommitment.set(commitment.toString(), idx)
  }

  return { tree, indexByCommitment }
}
