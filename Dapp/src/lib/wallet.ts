/**
 * MetaMask connection utilities + Sepolia chain switching helpers.
 */
import type { Eip1193Provider } from 'ethers'
import { BrowserProvider } from 'ethers'

export const METAMASK_INSTALL_URL = 'https://metamask.io/download/'

export type EthWithFlags = Eip1193Provider & {
  isMetaMask?: boolean
  providers?: EthWithFlags[]
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void
}

export function getMetaMaskProvider(): EthWithFlags | null {
  const raw = window.ethereum as EthWithFlags | undefined
  if (!raw) return null
  if (raw.isMetaMask) return raw
  const list = raw.providers
  if (Array.isArray(list)) {
    const mm = list.find((p) => p.isMetaMask)
    if (mm) return mm
  }
  return null
}

export function isMetaMaskAvailable(): boolean {
  return getMetaMaskProvider() != null
}

export type TargetChainInfo = {
  chainId: number
  chainName: string
  rpcUrl: string
  blockExplorerUrls: string[]
}

export function getTargetChainInfo(chainId: number): TargetChainInfo {
  const rpc = (import.meta.env.VITE_PUBLIC_RPC || '').trim()
  if (chainId === 11155111) {
    return {
      chainId,
      chainName: 'Sepolia',
      rpcUrl: rpc || 'https://rpc.sepolia.org',
      blockExplorerUrls: ['https://sepolia.etherscan.io'],
    }
  }
  if (chainId === 421614) {
    return {
      chainId,
      chainName: 'Arbitrum Sepolia',
      rpcUrl: rpc || 'https://sepolia-rollup.arbitrum.io/rpc',
      blockExplorerUrls: ['https://sepolia.arbiscan.io'],
    }
  }
  return {
    chainId,
    chainName: `Chain ${chainId}`,
    rpcUrl: rpc || 'https://rpc.sepolia.org',
    blockExplorerUrls: [],
  }
}

export async function connectMetaMask(targetChainId: number): Promise<{
  provider: BrowserProvider
  signer: import('ethers').JsonRpcSigner
  account: string
  chainId: number
}> {
  const eth = getMetaMaskProvider()
  if (!eth) throw new Error('MetaMask is not installed.')

  await eth.request({ method: 'eth_requestAccounts' })

  const desiredHex = '0x' + targetChainId.toString(16)
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: desiredHex }],
    })
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 4902) {
      const info = getTargetChainInfo(targetChainId)
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: desiredHex,
            chainName: info.chainName,
            rpcUrls: [info.rpcUrl],
            blockExplorerUrls: info.blockExplorerUrls,
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          },
        ],
      })
    } else {
      throw e
    }
  }

  const provider = new BrowserProvider(eth)
  const signer = await provider.getSigner()
  const account = await signer.getAddress()
  const network = await provider.getNetwork()
  return {
    provider,
    signer,
    account,
    chainId: Number(network.chainId),
  }
}
