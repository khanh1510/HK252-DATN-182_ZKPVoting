import { useEffect, useState } from 'react'
import { Contract } from 'ethers'
import { useWalletCtx } from '@/context/WalletContext'
import { POOL_ABI, PHASE } from '@/lib/abi'
import { formatContractError } from '@/lib/ethersError'
import type { PoolMeta } from '../PollPage'

type Props = { pool: string; meta: PoolMeta }

const BAR_COLORS = [
  'bg-gray-400',       // Abstain
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
]

const TEXT_COLORS = [
  'text-gray-600',
  'text-blue-700',
  'text-violet-700',
  'text-emerald-700',
  'text-orange-700',
  'text-pink-700',
  'text-teal-700',
  'text-red-700',
]

export function ResultsPanel({ pool, meta }: Props) {
  const { provider } = useWalletCtx()
  const [counts, setCounts] = useState<bigint[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!provider) return
    const c = new Contract(pool, POOL_ABI, provider)
    c.getResults()
      .then((arr: bigint[]) => setCounts(arr.map(BigInt)))
      .catch((e: unknown) => setError(formatContractError(e)))
  }, [provider, pool, meta.phase])

  const ended = meta.phase === PHASE.Ended
  const total = counts ? counts.reduce((acc, x) => acc + Number(x), 0) : 0
  const winner = counts && ended
    ? counts.reduce((best, n, i) => (Number(n) > Number(counts[best]) ? i : best), 0)
    : -1

  return (
    <div className="px-5 pb-5 space-y-4">

      {/* Not ended warning */}
      {!ended && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">
          <p className="font-medium">Results not available yet</p>
          <p className="text-xs mt-0.5 opacity-80">The poll must complete the Reveal phase before results are shown.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl break-all">{error}</div>
      )}

      {/* Winner banner */}
      {ended && counts && winner >= 0 && Number(counts[winner]) > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">Winner</p>
          <p className="text-lg font-bold text-gray-900">
            {winner === 0 ? 'Abstain' : meta.candidates[winner]}
          </p>
          <p className="text-xs text-gray-500">
            {counts[winner].toString()} votes · {total > 0 ? Math.round((Number(counts[winner]) / total) * 100) : 0}%
          </p>
        </div>
      )}

      {/* Total */}
      {counts && (
        <div className="flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
          <span className="font-semibold text-[hsl(var(--foreground))]">{total}</span> total votes revealed
        </div>
      )}

      {/* Bar chart */}
      {counts && (
        <div className="space-y-4">
          {counts.map((n, i) => {
            const pct = total === 0 ? 0 : Math.round((Number(n) / total) * 100)
            const name = i === 0 ? 'Abstain' : meta.candidates[i]
            const isWinner = i === winner && ended && Number(n) > 0

            return (
              <div key={i} className={`p-3 rounded-xl border transition-all ${
                isWinner ? 'bg-blue-50 border-blue-200' : 'bg-white border-[hsl(var(--border))]'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isWinner && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    <span className={`text-sm font-medium ${isWinner ? TEXT_COLORS[i % TEXT_COLORS.length] : 'text-[hsl(var(--foreground))]'}`}>
                      {name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[hsl(var(--foreground))]">{n.toString()}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isWinner ? 'bg-blue-100 text-blue-700' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                    }`}>{pct}%</span>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* No counts loading */}
      {!counts && !error && ended && (
        <div className="space-y-3">
          {meta.candidates.map((_, i) => (
            <div key={i} className="p-3 rounded-xl border border-[hsl(var(--border))] space-y-2">
              <div className="h-4 skeleton rounded w-1/3" />
              <div className="h-2.5 skeleton rounded-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
