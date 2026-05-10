/**
 * Web3Modal v5 (AppKit) — WalletConnect v2 integration.
 * Supports MetaMask, Trust Wallet, Coinbase Wallet, and any WalletConnect-compatible wallet
 * on both desktop and mobile.
 *
 * Must be imported once at app startup (see main.tsx) before any hooks are used.
 */
import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react'
import { appConfig } from '@/config'

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '306fab4eb3c66bf5ee154bc4ad147522'

const CHAINS = [
  {
    chainId:     11155111,
    name:        'Ethereum Sepolia',
    currency:    'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrl:      'https://rpc.sepolia.org',
  },
  {
    chainId:     421614,
    name:        'Arbitrum Sepolia',
    currency:    'ETH',
    explorerUrl: 'https://sepolia.arbiscan.io',
    rpcUrl:      'https://arbitrum-sepolia.publicnode.com',
  },
  {
    chainId:     31337,
    name:        'Localhost',
    currency:    'ETH',
    explorerUrl: 'http://localhost:8545',
    rpcUrl:      'http://127.0.0.1:8545',
  },
]

export const web3modal = createWeb3Modal({
  ethersConfig: defaultConfig({
    metadata: {
      name:        'ZK Vote',
      description: 'Anonymous ZK Voting powered by Groth16 zk-SNARK',
      url:         typeof window !== 'undefined' ? window.location.origin : 'https://zkvote.app',
      icons:       ['/favicon.svg'],
    },
    defaultChainId: appConfig.chainId,
    enableEIP6963:  true,   // auto-detect injected wallets (MetaMask, Rabby...)
    enableInjected: true,
    enableCoinbase: true,
    rpcUrl:         CHAINS.find(c => c.chainId === appConfig.chainId)?.rpcUrl,
  }),
  chains:    CHAINS,
  projectId: PROJECT_ID,
  themeMode: 'light',
  themeVariables: {
    '--w3m-font-family':  '"DM Sans", system-ui, sans-serif',
    '--w3m-accent':       '#4285F4',
    '--w3m-border-radius-master': '12px',
  },
})
