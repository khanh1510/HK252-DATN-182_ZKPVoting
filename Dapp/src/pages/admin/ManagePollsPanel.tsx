import { useEffect, useState } from 'react'
import { Contract } from 'ethers'
import { useWalletCtx } from '@/context/WalletContext'
import { usePolls } from '@/hooks/usePolls'
import { POOL_ABI, PHASE_LABEL, PHASE } from '@/lib/abi'
import { fmtTimestamp, shortAddr } from '@/lib/utils'
import { formatContractError } from '@/lib/ethersError'

const PHASE_CHIP: Record<number, string> = {
  0: 'bg-blue-50 text-blue-700 border-blue-200',
  1: 'bg-violet-50 text-violet-700 border-violet-200',
  2: 'bg-orange-50 text-orange-700 border-orange-200',
  3: 'bg-gray-50 text-gray-600 border-gray-200',
}

const PHASE_ICONS: Record<number, string> = { 0: '', 1: '', 2: '', 3: '' }

// ─── Weight assignment UI for a single weighted poll ─────────────────────────
function WeightPanel({ pool, signer }: { pool: string; signer: ReturnType<typeof useWalletCtx>['signer'] }) {
  const [registeredVoters, setRegisteredVoters] = useState<{ nullifierHash: string; leafIndex: string }[]>([])
  const [weights, setWeights] = useState<Record<string, string>>({})
  const [busy, setBusy]       = useState(false)
  const [info, setInfo]       = useState<string | null>(null)
  const [err, setErr]         = useState<string | null>(null)

  // Fetch VoterRegistered events to get list of registered nullifierHashes
  useEffect(() => {
    if (!signer) return
    const c = new Contract(pool, POOL_ABI, signer)
    c.queryFilter(c.filters.VoterRegistered()).then((evts: unknown[]) => {
      const voters = (evts as { args: { leafIndex: bigint; nullifierHash: bigint } }[]).map(e => ({
        leafIndex:    e.args.leafIndex.toString(),
        nullifierHash: e.args.nullifierHash.toString(),
      }))
      setRegisteredVoters(voters)
      // Pre-fill existing weights
      const initialWeights: Record<string, string> = {}
      voters.forEach(v => { initialWeights[v.nullifierHash] = '1' })
      setWeights(initialWeights)
    }).catch(() => null)
  }, [pool, signer])

  const saveWeights = async () => {
    if (!signer) return
    setBusy(true); setInfo(null); setErr(null)
    try {
      const c = new Contract(pool, POOL_ABI, signer)
      for (const voter of registeredVoters) {
        const w = parseInt(weights[voter.nullifierHash] || '1')
        if (isNaN(w) || w < 1) continue
        const feeData = await signer.provider!.getFeeData()
        const gas = feeData.maxFeePerGas ? { maxFeePerGas: feeData.maxFeePerGas * 130n / 100n } : {}
        const tx = await c.setWeight(BigInt(voter.nullifierHash), BigInt(w), gas)
        await tx.wait()
      }
      setInfo(`Weights saved for ${registeredVoters.length} voter(s).`)
    } catch (e) {
      setErr(formatContractError(e))
    } finally {
      setBusy(false)
    }
  }

  if (registeredVoters.length === 0) {
    return (
      <div className="mt-3 p-3 bg-[hsl(var(--muted))] rounded-xl text-xs text-[hsl(var(--muted-foreground))] text-center">
        No voters have registered yet (or this poll is not in weighted mode).
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
        Assign weights ({registeredVoters.length} voter(s) registered)
      </p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {registeredVoters.map(v => (
          <div key={v.nullifierHash} className="flex items-center gap-2 bg-[hsl(var(--muted))] rounded-lg p-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Leaf #{v.leafIndex}</p>
              <p className="font-mono text-[10px] text-[hsl(var(--foreground))] truncate">{v.nullifierHash}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">weight =</span>
              <input
                type="number" min={1} value={weights[v.nullifierHash] ?? '1'}
                onChange={e => setWeights(prev => ({ ...prev, [v.nullifierHash]: e.target.value }))}
                className="w-16 rounded-lg border border-[hsl(var(--border))] bg-white px-2 py-1 text-sm text-center font-mono"
              />
            </div>
          </div>
        ))}
      </div>
      <button onClick={saveWeights} disabled={busy}
        className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
        {busy ? 'Saving…' : 'Save weights on-chain'}
      </button>
      {info && <p className="text-xs text-emerald-600">{info}</p>}
      {err  && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

export function ManagePollsPanel() {
  const { provider, signer, account } = useWalletCtx()
  const { polls, loading, error, refresh } = usePolls(provider)
  const [busyId, setBusyId]           = useState<number | null>(null)
  const [txError, setTxError]         = useState<string | null>(null)
  const [expandedWeight, setExpandedWeight] = useState<string | null>(null)

  const myPolls = polls.filter(
    (p) => account && p.admin.toLowerCase() === account.toLowerCase(),
  )

  const callPhase = async (
    pool: string,
    method: 'startVoting' | 'startReveal' | 'endPoll',
    id: number,
  ) => {
    if (!signer) return
    setBusyId(id); setTxError(null)
    try {
      const c = new Contract(pool, POOL_ABI, signer)
      // Add 30% gas buffer to avoid "max fee < base fee" on L2
      const feeData = await signer.provider!.getFeeData()
      const gasOverrides = feeData.maxFeePerGas
        ? { maxFeePerGas: feeData.maxFeePerGas * 130n / 100n }
        : {}
      const tx = await c[method](gasOverrides)
      await tx.wait()
      await refresh()
    } catch (e) {
      setTxError(formatContractError(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Your Polls</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Manually advance phases. Phases also auto-advance once their deadline passes.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] hover:bg-white transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={loading ? 'animate-spin' : ''}>
            <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Errors */}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}
      {txError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 break-all">{txError}</div>}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="border border-[hsl(var(--border))] rounded-2xl p-4 space-y-2">
              <div className="h-4 skeleton rounded w-1/2" />
              <div className="h-3 skeleton rounded w-1/3" />
              <div className="h-8 skeleton rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && myPolls.length === 0 && (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#9ca3af" strokeWidth="1.8"/><path d="M9 9h6M9 13h4" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-1">No polls found</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">You don't administer any polls. Create one in the "Create Poll" tab.</p>
        </div>
      )}

      {/* Poll list */}
      {myPolls.map((p) => (
        <div key={p.pool} className="border border-[hsl(var(--border))] rounded-2xl p-4 space-y-3 bg-white hover:border-blue-200 transition-colors">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1">
              <p className="font-semibold text-[hsl(var(--foreground))]">{p.proposal}</p>
              <p className="text-xs font-mono text-[hsl(var(--muted-foreground))] mt-0.5">
                Pool: {shortAddr(p.pool)}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${PHASE_CHIP[p.phase] ?? PHASE_CHIP[3]}`}>
              {PHASE_ICONS[p.phase] ?? '•'} {PHASE_LABEL[p.phase]}
            </span>
          </div>

          {/* Deadlines */}
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] bg-[hsl(var(--muted))] rounded-xl p-2">
            {[
              { label: 'Register', ts: p.registrationDeadline },
              { label: 'Voting', ts: p.votingDeadline },
              { label: 'Reveal', ts: p.revealDeadline },
            ].map(({ label, ts }) => (
              <div key={label}>
                <p className="font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{label}</p>
                <p className="text-[hsl(var(--foreground))] mt-0.5 leading-tight">{fmtTimestamp(ts)}</p>
              </div>
            ))}
          </div>

          {/* Weight assignment (weighted polls only) */}
          {p.isWeighted && (
            <div>
              <button
                onClick={() => setExpandedWeight(expandedWeight === p.pool ? null : p.pool)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 text-xs font-medium rounded-lg hover:bg-violet-100 transition-colors"
              >
                {expandedWeight === p.pool ? 'Hide weights' : 'Assign Weights'}
              </button>
              {expandedWeight === p.pool && <WeightPanel pool={p.pool} signer={signer} />}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              disabled={busyId === p.id || p.phase !== PHASE.Registration}
              onClick={() => callPhase(p.pool, 'startVoting', p.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 text-xs font-medium rounded-lg hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busyId === p.id && p.phase === PHASE.Registration
                ? <span className="inline-block w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                : null}
              Start Voting
            </button>
            <button
              disabled={busyId === p.id || p.phase !== PHASE.Voting}
              onClick={() => callPhase(p.pool, 'startReveal', p.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 text-xs font-medium rounded-lg hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busyId === p.id && p.phase === PHASE.Voting
                ? <span className="inline-block w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                : null}
              Start Reveal
            </button>
            <button
              disabled={busyId === p.id || p.phase !== PHASE.Reveal}
              onClick={() => callPhase(p.pool, 'endPoll', p.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busyId === p.id && p.phase === PHASE.Reveal
                ? <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                : null}
              End Poll
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
