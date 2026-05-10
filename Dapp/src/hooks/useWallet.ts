/**
 * Wallet connection hook using Web3Modal v5 (WalletConnect v2).
 * Supports MetaMask extension, MetaMask Mobile, Trust Wallet, Coinbase Wallet,
 * and any WalletConnect-compatible wallet on desktop + mobile.
 *
 * Interface is identical to the old MetaMask-only hook — no changes needed elsewhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserProvider, JsonRpcProvider, JsonRpcSigner, parseEther } from 'ethers'
import {
  useWeb3ModalAccount,
  useWeb3ModalProvider,
  useDisconnect,
  useWeb3Modal,
} from '@web3modal/ethers/react'
import { appConfig } from '@/config'

// Minimum balance before auto-drip triggers (0.005 ETH)
const MIN_BALANCE = parseEther('0.005')

// Public RPC map per chainId — used for read-only contract calls (getAllPolls etc.)
// so they don't depend on the wallet provider being ready.
const PUBLIC_RPC: Record<number, string> = {
  11155111: 'https://rpc.sepolia.org',
  421614:   'https://arbitrum-sepolia.publicnode.com',
}

export type WalletState = {
  available:      boolean
  account:        string | null
  chainId:        number | null
  provider:       BrowserProvider | null
  signer:         JsonRpcSigner | null
  connecting:     boolean
  error:          string | null
}

export function useWallet() {
  const { address, chainId, isConnected } = useWeb3ModalAccount()
  const { walletProvider }                = useWeb3ModalProvider()
  const { disconnect: wcDisconnect }      = useDisconnect()
  const { open, close }                   = useWeb3Modal()

  const [walletBrowserProvider, setWalletBrowserProvider] = useState<BrowserProvider | null>(null)
  const [signer, setSigner]         = useState<JsonRpcSigner | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const dripSent = useRef<Set<string>>(new Set())

  // Read-only provider — uses public RPC, always available regardless of wallet state.
  // Used by usePolls and contract reads so they work even before signer is ready.
  const readProvider = isConnected && chainId
    ? new JsonRpcProvider(PUBLIC_RPC[Number(chainId)] ?? PUBLIC_RPC[appConfig.chainId])
    : new JsonRpcProvider(PUBLIC_RPC[appConfig.chainId])

  // Wallet provider — used for signing transactions (register, vote, reveal…)
  useEffect(() => {
    if (!walletProvider || !isConnected || !address) {
      setWalletBrowserProvider(null)
      setSigner(null)
      return
    }
    const p = new BrowserProvider(walletProvider as import('ethers').Eip1193Provider)
    setWalletBrowserProvider(p)
    // Construct signer directly from known address to avoid eth_accounts RPC call,
    // which is blocked by WalletConnect email/social wallets.
    try {
      setSigner(new JsonRpcSigner(p, address))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [walletProvider, isConnected, address])

  // Auto-drip: if wallet balance is below threshold, request ETH from faucet.
  // Runs once per address per session to avoid repeat calls.
  useEffect(() => {
    if (!appConfig.faucetUrl || !isConnected || !address) return
    if (dripSent.current.has(address)) return

    const activeChainId = chainId ? Number(chainId) : appConfig.chainId
    const rpc = PUBLIC_RPC[activeChainId] ?? PUBLIC_RPC[appConfig.chainId]
    const provider = new JsonRpcProvider(rpc)

    provider.getBalance(address).then(balance => {
      if (balance >= MIN_BALANCE) return
      dripSent.current.add(address)
      fetch(`${appConfig.faucetUrl}/faucet`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.txHash) console.info(`[faucet] sent ${data.amount} → ${address} (${data.txHash})`)
          else console.warn('[faucet]', data.error)
        })
        .catch(e => console.warn('[faucet] unreachable:', e.message))
    }).catch(() => { /* ignore balance check errors */ })
  }, [isConnected, address, chainId])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      await open()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(false)
    }
  }, [open])

  const disconnect = useCallback(async () => {
    try {
      await wcDisconnect()
      close()
    } catch { /* ignore */ }
    setWalletBrowserProvider(null)
    setSigner(null)
  }, [wcDisconnect, close])

  return {
    available:      true,
    account:        isConnected && address ? address : null,
    chainId:        chainId ? Number(chainId) : null,
    // provider exposed to the rest of the app: prefer wallet-connected provider for signing,
    // fall back to read-only public RPC provider for contract reads.
    provider:       walletBrowserProvider ?? readProvider,
    signer,
    connecting,
    error,
    connect,
    disconnect,
    isCorrectChain: Number(chainId) === appConfig.chainId,
  }
}
