import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useWalletCtx } from '@/context/WalletContext'
import { usePolls } from '@/hooks/usePolls'
import { ELIGIBILITY_MODE, PHASE, type Phase } from '@/lib/abi'
import { fmtTimestamp, shortAddr } from '@/lib/utils'

const PHASE_CFG: Record<number, { label: string; dot: string; text: string; bg: string }> = {
  0: { label: 'Registration', dot: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  1: { label: 'Voting',       dot: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  2: { label: 'Reveal',       dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  3: { label: 'Ended',        dot: 'bg-gray-400',   text: 'text-gray-500',   bg: 'bg-gray-100 border-gray-200' },
}

const FILTER_TABS: { key: string; label: string; phases?: Phase[] }[] = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active',       phases: [PHASE.Registration, PHASE.Voting, PHASE.Reveal] },
  { key: 'voting',   label: 'Voting',       phases: [PHASE.Voting] },
  { key: 'ended',    label: 'Ended',        phases: [PHASE.Ended] },
]

export default function HomePage() {
  const { provider } = useWalletCtx()
  const { polls, loading, error, factoryAvailable } = usePolls(provider)

  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')

  const filtered = useMemo(() => {
    let list = polls
    // Phase filter
    const tab = FILTER_TABS.find(t => t.key === filter)
    if (tab?.phases) list = list.filter(p => tab.phases!.includes(p.phase as Phase))
    // Search
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(p =>
      p.proposal.toLowerCase().includes(q) ||
      p.admin.toLowerCase().includes(q)
    )
    return list
  }, [polls, filter, search])

  if (!factoryAvailable) return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4 max-w-2xl">
      <div className="text-amber-500 text-2xl">⚠️</div>
      <div>
        <h2 className="font-semibold text-amber-900 mb-1">Configuration missing</h2>
        <p className="text-sm text-amber-800">
          Set <code className="px-1.5 py-0.5 bg-amber-100 rounded font-mono text-xs">VITE_FACTORY_ADDRESS</code> in{' '}
          <code className="px-1.5 py-0.5 bg-amber-100 rounded font-mono text-xs">web/.env</code>.
        </p>
      </div>
    </div>
  )

  const activeCount  = polls.filter(p => p.phase !== PHASE.Ended).length
  const votingCount  = polls.filter(p => p.phase === PHASE.Voting).length
  const endedCount   = polls.filter(p => p.phase === PHASE.Ended).length

  return (
    <div className="flex gap-6 items-start">

    {/* ── LEFT column ─────────────────────────────────────────────── */}
    <div className="flex-1 min-w-0 space-y-5">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Polls</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading ? 'Loading…' : `${polls.length} poll${polls.length !== 1 ? 's' : ''} on-chain`}
          </p>
        </div>
        <Link to="/admin"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Admin Panel
        </Link>
      </div>

      {/* ── Search + Filter bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search proposals…"
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-colors"
          />
        </div>

        {/* Phase filter tabs */}
        <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 gap-0.5">
          {FILTER_TABS.map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-[hsl(var(--primary))] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {tab.label}
              {tab.key !== 'all' && !loading && (
                <span className={`ml-1.5 tabular-nums ${filter === tab.key ? 'opacity-80' : 'text-gray-400'}`}>
                  {tab.phases ? polls.filter(p => tab.phases!.includes(p.phase as Phase)).length : polls.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* ── List ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Loading */}
        {loading && (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                </div>
                <div className="h-6 w-20 bg-gray-100 rounded-full" />
                <div className="h-6 w-24 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">🗳️</div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              {search || filter !== 'all' ? 'No polls match your filter' : 'No polls yet'}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {search || filter !== 'all' ? 'Try adjusting your search or filter.' : 'Ask an admin to create a poll.'}
            </p>
            {filter !== 'all' || search ? (
              <button onClick={() => { setFilter('all'); setSearch('') }}
                className="text-xs text-[hsl(var(--primary))] hover:underline">Clear filters</button>
            ) : (
              <Link to="/admin" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[hsl(var(--primary))] text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors">
                Create a poll
              </Link>
            )}
          </div>
        )}

        {/* Rows */}
        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-gray-100">
            {/* Column header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-6 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Proposal</span>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 text-center">Status</span>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20 text-center hidden md:block">Mode</span>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-36 text-right hidden lg:block">Deadline</span>
              <span className="w-8" />
            </div>

            {filtered.map(p => {
              const cfg    = PHASE_CFG[p.phase] ?? PHASE_CFG[3]
              const isOpen = p.mode === ELIGIBILITY_MODE.OPEN
              const deadline =
                p.phase === PHASE.Registration ? p.registrationDeadline :
                p.phase === PHASE.Voting       ? p.votingDeadline :
                p.phase === PHASE.Reveal       ? p.revealDeadline : null

              return (
                <Link key={p.pool} to={`/poll/${p.pool}`}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group">

                  {/* Proposal info */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[hsl(var(--primary))] transition-colors">
                      {p.proposal}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">by {shortAddr(p.admin)}</span>
                      <span className="text-gray-200">·</span>
                      <div className="flex gap-1 flex-wrap">
                        {p.candidates.slice(1, 4).map((c, i) => (
                          <span key={i} className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{c}</span>
                        ))}
                        {p.candidates.length > 4 && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">+{p.candidates.length - 4}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border w-24 justify-center ${cfg.bg} ${cfg.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${p.phase !== PHASE.Ended ? 'animate-pulse' : ''}`} />
                    {cfg.label}
                  </span>

                  {/* Mode */}
                  <span className={`text-xs font-medium px-2 py-1 rounded-full w-20 text-center hidden md:block ${
                    isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
                  }`}>
                    {isOpen ? '🌐 Open' : '🏢 Private'}
                  </span>

                  {/* Deadline */}
                  <div className="text-right hidden lg:block w-36">
                    {deadline && p.phase !== PHASE.Ended ? (
                      <>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                          {p.phase === PHASE.Registration ? 'Reg ends' : p.phase === PHASE.Voting ? 'Vote ends' : 'Reveal ends'}
                        </p>
                        <p className="text-xs font-medium text-gray-600">{fmtTimestamp(deadline)}</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">{fmtTimestamp(p.revealDeadline)}</p>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="w-8 flex justify-end">
                    <svg className="text-gray-300 group-hover:text-[hsl(var(--primary))] transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          Showing {filtered.length} of {polls.length} polls
        </p>
      )}
    </div>

    {/* ── RIGHT: Stats panel ──────────────────────────────────────── */}
    <div className="w-64 shrink-0 space-y-4 sticky top-6">

      {/* Overview card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Overview</p>
        <div className="space-y-3">
          {[
            { label: 'Total Polls',   value: polls.length,  color: 'text-gray-800' },
            { label: 'Active',        value: activeCount,   color: 'text-violet-600' },
            { label: 'Voting Now',    value: votingCount,   color: 'text-green-600' },
            { label: 'Ended',         value: endedCount,    color: 'text-gray-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-500">{label}</span>
              <span className={`text-sm font-bold tabular-nums ${color}`}>{loading ? '—' : value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Network card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Network</p>
        <div className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Chain</span>
            <span className="font-medium text-gray-800">Arbitrum Sepolia</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Proof</span>
            <span className="font-medium text-gray-800">Groth16</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Privacy</span>
            <span className="font-medium text-green-600">ZK-SNARK ✓</span>
          </div>
        </div>
      </div>

      {/* Create CTA */}
      <Link to="/admin"
        className="flex items-center justify-center gap-2 w-full py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors shadow-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        Create Poll
      </Link>
    </div>

  </div>
  )
}
