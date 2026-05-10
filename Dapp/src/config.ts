/** App-level config from .env (VITE_*) */
export const appConfig = {
  chainId: Number(import.meta.env.VITE_CHAIN_ID || '11155111'),
  factoryAddress: (import.meta.env.VITE_FACTORY_ADDRESS || '').trim(),
  zkWasmUrl: '/zk/vote.wasm',
  zkZkeyUrl: '/zk/vote_final.zkey',
  useDummyProof: import.meta.env.VITE_USE_DUMMY_PROOF === 'true',
  /** Block number when PollFactory was deployed — used as fromBlock for event queries. */
  deploymentBlock: Number(import.meta.env.VITE_DEPLOYMENT_BLOCK || '0'),
  /** Faucet server URL — set VITE_FAUCET_URL to enable automatic drip for social-login wallets. */
  faucetUrl: (import.meta.env.VITE_FAUCET_URL || '').trim(),
} as const

export function configOk(): boolean {
  return appConfig.factoryAddress.startsWith('0x')
}
