import { buildPoseidon } from 'circomlibjs'

export type PoseidonBundle = {
  hash1: (elts: bigint[]) => bigint
  hash2: (elts: bigint[]) => bigint
  hashN: (elts: bigint[]) => bigint  // general N-input hash (e.g. 9 inputs for choices+blinding)
}

let cache: PoseidonBundle | null = null

export async function getPoseidon(): Promise<PoseidonBundle> {
  if (cache) return cache
  const poseidon = await buildPoseidon()
  const F = poseidon.F
  const hashN = (elts: bigint[]) => BigInt(F.toString(poseidon(elts)))
  cache = { hash1: hashN, hash2: hashN, hashN }
  return cache
}
