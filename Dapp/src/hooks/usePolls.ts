/**
 * Reads all polls from PollFactory + per-pool meta from VotingPool.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Contract, type Provider } from 'ethers'
import { FACTORY_ABI, POOL_ABI, type EligibilityMode, type Phase } from '@/lib/abi'
import { appConfig } from '@/config'

export type PollSummary = {
  id: number
  pool: string
  admin: string
  mode: EligibilityMode
  proposal: string
  createdAt: bigint
  phase: Phase
  registrationDeadline: bigint
  votingDeadline: bigint
  revealDeadline: bigint
  candidates: string[]
  isWeighted: boolean
}

export function usePolls(provider: Provider | null) {
  const [polls, setPolls] = useState<PollSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const factory = useMemo(() => {
    if (!provider) return null
    if (!appConfig.factoryAddress.startsWith('0x')) return null
    return new Contract(appConfig.factoryAddress, FACTORY_ABI, provider)
  }, [provider])

  const refresh = useCallback(async () => {
    if (!factory || !provider) return
    setLoading(true)
    setError(null)
    try {
      const list = await factory.getAllPolls()
      const enriched: PollSummary[] = []
      for (let i = 0; i < list.length; i++) {
        const p = list[i] as { pool: string; admin: string; mode: number; proposal: string; createdAt: bigint }
        const pool = new Contract(p.pool, POOL_ABI, provider)
        const [phase, regDl, voteDl, revealDl, cands, weighted] = await Promise.all([
          pool.currentPhaseActual(),
          pool.registrationDeadline(),
          pool.votingDeadline(),
          pool.revealDeadline(),
          pool.getCandidates(),
          pool.isWeighted().catch(() => false),
        ])
        enriched.push({
          id: i,
          pool: p.pool,
          admin: p.admin,
          mode: Number(p.mode) as EligibilityMode,
          proposal: p.proposal,
          createdAt: BigInt(p.createdAt),
          phase: Number(phase) as Phase,
          registrationDeadline: BigInt(regDl),
          votingDeadline: BigInt(voteDl),
          revealDeadline: BigInt(revealDl),
          candidates: cands as string[],
          isWeighted: Boolean(weighted),
        })
      }
      setPolls(enriched)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [factory, provider])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { polls, loading, error, refresh, factoryAvailable: factory != null }
}
