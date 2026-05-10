declare module 'circomlibjs' {
  type PoseidonF = { toString: (x: unknown) => string }
  type PoseidonFn = ((elts: bigint[]) => unknown) & { F: PoseidonF }
  export function buildPoseidon(): Promise<PoseidonFn>
}

declare module 'snarkjs' {
  type Groth16Proof = {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
  }
  export const groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasm: string,
      zkey: string,
    ) => Promise<{ proof: Groth16Proof; publicSignals: string[] }>
    prove: (
      zkey: string,
      witness: Uint8Array,
    ) => Promise<{ proof: Groth16Proof; publicSignals: string[] }>
    verify: (
      vkey: unknown,
      publicSignals: string[],
      proof: Groth16Proof,
    ) => Promise<boolean>
  }
}

declare module '@zk-kit/incremental-merkle-tree' {
  export class IncrementalMerkleTree {
    root: bigint
    constructor(
      hash: (v: unknown[]) => bigint,
      depth: number,
      zero: bigint,
      arity: number,
      leaves: unknown[],
    )
    insert(leaf: bigint): void
    createProof(index: number): {
      siblings: bigint[][]
      pathIndices: number[]
    }
  }
}
