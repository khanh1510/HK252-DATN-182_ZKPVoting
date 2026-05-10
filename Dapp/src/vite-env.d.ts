/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID: string
  readonly VITE_FACTORY_ADDRESS: string
  /** true = submit dummy zero proof; only valid against MockGroth16Verifier */
  readonly VITE_USE_DUMMY_PROOF: string
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  /** Public RPC for wallet_addEthereumChain */
  readonly VITE_PUBLIC_RPC: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  ethereum?: import('ethers').Eip1193Provider
}
