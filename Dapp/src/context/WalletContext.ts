import { createContext, useContext } from 'react'
import type { useWallet } from '@/hooks/useWallet'

type Ctx = ReturnType<typeof useWallet> | null

export const WalletContext = createContext<Ctx>(null)

export function useWalletCtx() {
  const v = useContext(WalletContext)
  if (!v) throw new Error('useWalletCtx must be used inside WalletContext.Provider')
  return v
}
