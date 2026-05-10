import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Contract } from 'ethers'
import { useWalletCtx } from '@/context/WalletContext'
import { POOL_ABI, PHASE, ELIGIBILITY_MODE, type Phase, type EligibilityMode } from '@/lib/abi'
import { fmtTimestamp, shortAddr } from '@/lib/utils'
import { RegisterPanel } from './poll/RegisterPanel'
import { VotePanel }     from './poll/VotePanel'
import { RevealPanel }   from './poll/RevealPanel'
import { ResultsPanel }  from './poll/ResultsPanel'
import { loadBallotBackup } from '@/lib/identity'
import { CountdownTimer } from '@/components/CountdownTimer'

export type PoolMeta = {
  proposal: string
  mode: EligibilityMode
  phase: Phase
  /** Raw on-chain phase (before deadline auto-advance). May differ from `phase`. */
  phaseOnChain: Phase
  admin: string
  candidates: string[]
  registrationDeadline: bigint
  votingDeadline: bigint
  revealDeadline: bigint
  numberOfLeaves: bigint
  totalVotesCast: bigint
  totalRevealed: bigint
  totalVotes: number
  maxPerCandidate: number
  allowAbstain: boolean
  isWeighted: boolean
}

const CAND_COLORS = ['#22c55e','#ef4444','#6366f1','#f59e0b','#06b6d4','#ec4899','#84cc16','#8b5cf6']

const PHASE_BADGE: Record<number, { label: string; cls: string; dot: string }> = {
  0: { label: 'Registration', cls: 'bg-blue-50   text-blue-700   border-blue-200',   dot: 'bg-blue-500' },
  1: { label: 'Ongoing',      cls: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  2: { label: 'Reveal',       cls: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  3: { label: 'Ended',        cls: 'bg-gray-100  text-gray-500   border-gray-200',   dot: 'bg-gray-400' },
}

const ACTION_TABS = [
  { key: 'register', label: 'Register' },
  { key: 'vote',     label: 'Vote' },
  { key: 'reveal',   label: 'Reveal' },
  { key: 'results',  label: 'Results' },
]

// ── Donut chart (SVG) ────────────────────────────────────────────────────────
function Donut({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset .7s ease' }} />
    </svg>
  )
}

export default function PollPage() {
  const { pool }              = useParams<{ pool: string }>()
  const { provider, account } = useWalletCtx()
  const [meta, setMeta]       = useState<PoolMeta | null>(null)
  const [counts, setCounts]   = useState<bigint[] | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [tick, setTick]       = useState(0)
  const [activeTab, setActiveTab]     = useState('register')
  const [revealReady, setRevealReady] = useState(false)

  const contract = useMemo(() => {
    if (!provider || !pool) return null
    return new Contract(pool, POOL_ABI, provider)
  }, [provider, pool])

  useEffect(() => {
    if (!contract) return
    let alive = true
    ;(async () => {
      try {
        const [
          proposal, mode, phase, phaseRaw, admin, candidates,
          regDl, voteDl, revealDl, leaves, cast, revealed,
          totalVotes, maxPerCandidate, allowAbstain, isWeighted,
        ] = await Promise.all([
          contract.proposal(), contract.mode(), contract.currentPhaseActual(), contract.currentPhase(),
          contract.owner(), contract.getCandidates(),
          contract.registrationDeadline(), contract.votingDeadline(), contract.revealDeadline(),
          contract.getNumberOfLeaves(), contract.totalVotesCast(), contract.totalRevealed(),
          contract.totalVotes(), contract.maxPerCandidate(), contract.allowAbstain(), contract.isWeighted().catch(() => false),
        ])
        if (!alive) return
        const phaseNum = Number(phase) as Phase
        setMeta({
          proposal, mode: Number(mode) as EligibilityMode,
          phase: phaseNum, phaseOnChain: Number(phaseRaw) as Phase,
          admin, candidates: Array.from(candidates as string[]),
          registrationDeadline: BigInt(regDl), votingDeadline: BigInt(voteDl), revealDeadline: BigInt(revealDl),
          numberOfLeaves: BigInt(leaves), totalVotesCast: BigInt(cast), totalRevealed: BigInt(revealed),
          totalVotes: Number(totalVotes), maxPerCandidate: Number(maxPerCandidate),
          allowAbstain: Boolean(allowAbstain), isWeighted: Boolean(isWeighted),
        })
        setActiveTab(
          phaseNum === PHASE.Registration ? 'register' :
          phaseNum === PHASE.Voting       ? 'vote'     :
          phaseNum === PHASE.Reveal       ? 'reveal'   : 'results'
        )
        if (phaseNum === PHASE.Reveal && pool && loadBallotBackup(pool) !== null) setRevealReady(true)
        else setRevealReady(false)

        try {
          const arr: bigint[] = await contract.getResults()
          if (alive) setCounts(arr.map(BigInt))
        } catch { /* not yet */ }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { alive = false }
  }, [contract, tick])

  const reload = () => setTick(t => t + 1)

  /* ── guards ── */
  if (!account) return (
    <div className="max-w-sm mx-auto mt-24 bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
      <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="#6366f1" strokeWidth="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <p className="font-semibold text-gray-800 mb-1">Wallet Required</p>
      <p className="text-sm text-gray-500">Connect your wallet to view this poll.</p>
    </div>
  )
  if (!pool)  return <p className="text-red-600 p-4">Missing pool address.</p>
  if (error)  return <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">{error}</div>
  if (!meta)  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-5 animate-pulse">
      <div className="space-y-4">
        <div className="h-32 bg-white rounded-2xl border border-gray-100" />
        <div className="h-96 bg-white rounded-2xl border border-gray-100" />
      </div>
      <div className="h-80 bg-white rounded-2xl border border-gray-100" />
    </div>
  )

  const badge = PHASE_BADGE[meta.phase] ?? PHASE_BADGE[3]
  const total = counts ? counts.reduce((a, b) => a + Number(b), 0) : 0
  const winner = counts && meta.phase === PHASE.Ended
    ? counts.reduce((best, n, i) => Number(n) > Number(counts[best]) ? i : best, 0) : -1
  const hasResults = counts !== null && total > 0

  const activeDeadline =
    meta.phase === PHASE.Registration ? meta.registrationDeadline :
    meta.phase === PHASE.Voting       ? meta.votingDeadline :
    meta.phase === PHASE.Reveal       ? meta.revealDeadline : null

  const activeDeadlineLabel =
    meta.phase === PHASE.Registration ? 'Registration ends in' :
    meta.phase === PHASE.Voting       ? 'Voting ends in' :
    meta.phase === PHASE.Reveal       ? 'Reveal ends in' : ''

  const participationPct = meta.numberOfLeaves > 0n
    ? Math.round(Number(meta.totalRevealed) / Number(meta.numberOfLeaves) * 100) : 0

  /* ── Action title per phase ── */
  const actionTitle =
    activeTab === 'register' ? 'Register to Vote'    :
    activeTab === 'vote'     ? 'Cast Your Vote'      :
    activeTab === 'reveal'   ? 'Reveal Your Ballot'  : 'Results'
  const actionDesc =
    activeTab === 'register' ? 'Generate your secret identity, then submit your commitment.' :
    activeTab === 'vote'     ? 'Pick your candidate and generate a zero-knowledge proof.'    :
    activeTab === 'reveal'   ? 'Submit the reveal so your vote is counted.'                  :
                               'Final tally of all revealed ballots.'

  return (
    <div className="space-y-4">

      {/* ── Top nav ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors shadow-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Go Back
        </Link>
        {revealReady && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 text-xs text-orange-800 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="font-medium">You have a ballot ready to reveal.</span>
            <button onClick={() => setActiveTab('reveal')}
              className="ml-1 underline underline-offset-2 font-semibold hover:text-orange-600 transition-colors">
              Reveal now →
            </button>
          </div>
        )}
      </div>

      {/* ── 2-column ─────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">

        {/* ════ LEFT: proposal + main action ══════════════════════ */}
        <div className="space-y-4 min-w-0">

          {/* Compact proposal header */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} ${meta.phase !== PHASE.Ended ? 'animate-pulse' : ''}`} />
                {badge.label}
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                meta.mode === ELIGIBILITY_MODE.OPEN ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
              }`}>
                {meta.mode === ELIGIBILITY_MODE.OPEN ? 'Open DAO' : 'Permissioned'}
              </span>
              {meta.isWeighted && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">Weighted</span>
              )}
              {activeDeadline && meta.phase !== PHASE.Ended && (
                <span className="ml-auto">
                  <CountdownTimer deadline={activeDeadline} label={activeDeadlineLabel} onExpired={reload} urgent={3600} />
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold text-gray-900 leading-snug mb-3">{meta.proposal}</h1>

            <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
              <span>Created by{' '}
                <a href={`https://sepolia.arbiscan.io/address/${meta.admin}`} target="_blank" rel="noreferrer"
                  className="font-mono font-medium text-[hsl(var(--primary))] hover:underline">{shortAddr(meta.admin)}</a>
              </span>
              <span className="text-gray-200">·</span>
              <span>Pool{' '}
                <a href={`https://sepolia.arbiscan.io/address/${pool}`} target="_blank" rel="noreferrer"
                  className="font-mono text-gray-600 hover:text-[hsl(var(--primary))] transition-colors">{shortAddr(pool)}</a>
              </span>
              <span className="text-gray-200">·</span>
              <span>{meta.candidates.length - 1} candidate{meta.candidates.length - 1 !== 1 ? 's' : ''}{meta.allowAbstain ? ' + abstain' : ''}</span>
            </div>
          </div>

          {/* ── BIG action card ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Tab list */}
            <div className="flex border-b border-gray-100 px-2 pt-2">
              {ACTION_TABS.map(({ key, label }, i) => {
                const isCurrent = i === meta.phase
                const isActive  = activeTab === key
                return (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`relative flex-1 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
                      isActive
                        ? 'text-[hsl(var(--primary))] bg-[hsl(var(--accent))]'
                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                    }`}>
                    <span className="text-[10px] text-gray-300 mr-1.5">{i + 1}</span>
                    {label}
                    {isCurrent && (
                      <span className="absolute top-1.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[hsl(var(--primary))] rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Action header */}
            <div className="px-6 pt-5 pb-3">
              <h2 className="text-lg font-bold text-gray-900">{actionTitle}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{actionDesc}</p>
            </div>

            {/* Panel content */}
            <div>
              {activeTab === 'register' && <RegisterPanel pool={pool} meta={meta} onChanged={reload} />}
              {activeTab === 'vote'     && <VotePanel     pool={pool} meta={meta} onChanged={reload} />}
              {activeTab === 'reveal'   && <RevealPanel   pool={pool} meta={meta} onChanged={reload} onRevealed={() => setRevealReady(false)} />}
              {activeTab === 'results'  && <ResultsPanel  pool={pool} meta={meta} />}
            </div>
          </div>
        </div>

        {/* ════ RIGHT: stats + (timeline OR result) ═══════════════ */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* Quick stats */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Registered', value: meta.numberOfLeaves.toString() },
                { label: 'Cast',       value: meta.totalVotesCast.toString() },
                { label: 'Revealed',   value: meta.totalRevealed.toString() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xl font-bold text-gray-800 tabular-nums">{value}</div>
                  <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex justify-between text-[10px] mb-1.5 font-medium">
                <span className="text-gray-400">Participation</span>
                <span className="text-gray-700 tabular-nums">{participationPct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[hsl(var(--primary))] rounded-full transition-all duration-700"
                  style={{ width: `${participationPct}%` }} />
              </div>
            </div>
          </div>

          {/* ── Timeline OR Result (mutually exclusive) ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {hasResults ? (
              /* ── Results card ── */
              <>
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <p className="text-sm font-semibold text-gray-900">
                    {meta.phase === PHASE.Ended ? 'Final Result' : 'Live Result'}
                  </p>
                  <span className="text-xs text-gray-400 tabular-nums">{total} votes</span>
                </div>

                <div className="px-3 py-3 grid grid-cols-2 gap-2">
                  {counts!.slice(1).map((n, zi) => {
                    const i     = zi + 1
                    const pct   = total > 0 ? Math.round(Number(n) / total * 100) : 0
                    const color = CAND_COLORS[zi % CAND_COLORS.length]
                    const isWin = winner === i && meta.phase === PHASE.Ended && Number(n) > 0
                    return (
                      <div key={i} className={`flex flex-col items-center gap-1 p-2 rounded-xl ${isWin ? 'bg-green-50' : ''}`}>
                        <div className="relative">
                          <Donut pct={pct} color={color} size={64} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct}%</span>
                          </div>
                        </div>
                        <p className="text-[11px] font-semibold text-gray-700 text-center truncate w-full px-1">
                          {isWin && '🏆 '}{meta.candidates[i]}
                        </p>
                        <p className="text-[10px] text-gray-400 tabular-nums">{Number(n).toLocaleString()}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Mini timeline at bottom of result card */}
                <div className="px-5 pt-3 pb-4 border-t border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Phase</p>
                  <PhaseTrack meta={meta} />
                </div>
              </>
            ) : (
              /* ── Timeline card (when no results yet) ── */
              <div className="p-5">
                <p className="text-sm font-semibold text-gray-900 mb-1">Phase Timeline</p>
                <p className="text-xs text-gray-400 mb-4">Voting progresses through 4 phases.</p>

                <div className="space-y-3">
                  {[
                    { i: 0, label: 'Registration', desc: 'Voters submit commitments',  deadline: meta.registrationDeadline, color: 'bg-blue-500',   ring: 'ring-blue-100' },
                    { i: 1, label: 'Voting',       desc: 'Cast hidden ZK ballots',     deadline: meta.votingDeadline,       color: 'bg-violet-500', ring: 'ring-violet-100' },
                    { i: 2, label: 'Reveal',       desc: 'Reveal votes to be counted', deadline: meta.revealDeadline,       color: 'bg-orange-500', ring: 'ring-orange-100' },
                    { i: 3, label: 'Ended',        desc: 'Final results published',    deadline: null,                       color: 'bg-gray-400',   ring: 'ring-gray-100' },
                  ].map(({ i, label, desc, deadline, color, ring }, idx, arr) => {
                    const done    = i < meta.phase
                    const current = i === meta.phase
                    return (
                      <div key={i} className="flex gap-3">
                        {/* Vertical line + dot */}
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full shrink-0 ${
                            current ? `${color} ring-4 ${ring}` :
                            done    ? color :
                            'bg-gray-200'
                          }`} />
                          {idx < arr.length - 1 && (
                            <div className={`w-0.5 flex-1 mt-1 ${done ? color : 'bg-gray-200'}`} style={{ minHeight: '32px' }} />
                          )}
                        </div>
                        {/* Content */}
                        <div className="flex-1 pb-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm font-semibold ${current ? 'text-gray-900' : done ? 'text-gray-500' : 'text-gray-400'}`}>
                              {label}
                              {current && <span className="ml-1.5 text-[10px] font-medium text-[hsl(var(--primary))] bg-blue-50 px-1.5 py-0.5 rounded">Now</span>}
                              {done    && <span className="ml-1.5 text-[10px] font-medium text-emerald-600">✓</span>}
                            </p>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                          {deadline && (
                            <p className={`text-[10px] mt-1 tabular-nums ${current ? 'text-[hsl(var(--primary))] font-medium' : 'text-gray-400'}`}>
                              {current ? 'Ends ' : 'Ended '}{fmtTimestamp(deadline)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

/* ── Compact horizontal phase track (used inside results card) ─────── */
function PhaseTrack({ meta }: { meta: PoolMeta }) {
  return (
    <div className="flex items-center">
      {['Reg', 'Vote', 'Reveal', 'End'].map((lbl, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-0.5">
            <div className={`w-2 h-2 rounded-full ${
              i <= meta.phase ? 'bg-[hsl(var(--primary))]' : 'bg-gray-200'
            }`} />
            <span className={`text-[9px] ${i === meta.phase ? 'text-[hsl(var(--primary))] font-semibold' : 'text-gray-400'}`}>
              {lbl}
            </span>
          </div>
          {i < 3 && <div className={`flex-1 h-0.5 mx-1 ${i < meta.phase ? 'bg-[hsl(var(--primary))]' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  )
}
