import { useState, useMemo } from 'react'
import { Contract } from 'ethers'
import { useWalletCtx } from '@/context/WalletContext'
import { FACTORY_ABI, ELIGIBILITY_MODE } from '@/lib/abi'
import { appConfig } from '@/config'
import { formatContractError } from '@/lib/ethersError'

const DAY = 24 * 60 * 60
const CAND_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

function NumStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden h-9">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="w-8 h-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors text-lg leading-none select-none border-r border-gray-200">
        −
      </button>
      <input
        type="number" value={value} min={min} max={max}
        onChange={e => {
          const v = Number(e.target.value)
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
        }}
        className="w-14 h-full text-center text-sm font-semibold text-gray-700 tabular-nums bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="w-8 h-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors text-lg leading-none select-none border-l border-gray-200">
        +
      </button>
    </div>
  )
}

const STEPS = ['Proposal', 'Options', 'Voting', 'Duration']

export function CreatePollPanel() {
  const { signer } = useWalletCtx()

  // form state
  const [step, setStep]                 = useState(0)
  const [proposal, setProposal]         = useState('')
  const [mode, setMode]                 = useState<'OPEN' | 'ADMIN_APPROVED'>('OPEN')
  const [candidates, setCandidates]     = useState<string[]>(['Yes', 'No'])
  const [allowAbstain, setAllowAbstain] = useState(true)
  const [votingMode, setVotingMode]     = useState<'single' | 'multiple' | 'cumulative'>('single')
  const [multipleK, setMultipleK]       = useState(2)
  const [totalVotes, setTotalVotes]     = useState(10)
  const [maxPerCand, setMaxPerCand]     = useState(10)
  const [isWeighted, setIsWeighted]     = useState(false)
  const [regDays, setRegDays]           = useState(3)
  const [voteDays, setVoteDays]         = useState(7)
  const [revealDays, setRevealDays]     = useState(3)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo]   = useState<string | null>(null)

  const MAX_OPTIONS     = 7
  const validCandidates = candidates.map(s => s.trim()).filter(Boolean)

  const addOption    = () => { if (candidates.length < MAX_OPTIONS) setCandidates(p => [...p, '']) }
  const removeOption = (i: number) => setCandidates(p => p.filter((_, idx) => idx !== i))
  const updateOption = (i: number, v: string) => setCandidates(p => p.map((c, idx) => idx === i ? v : c))

  // per-step validation
  const stepErrors = useMemo(() => [
    // step 0: proposal
    !proposal.trim() ? 'Enter a proposal title.' : '',
    // step 1: options
    (() => {
      if (candidates.some(c => !c.trim())) return 'Some options are empty.'
      if (validCandidates.length < 1) return 'At least 1 option required.'
      const seen = new Set<string>()
      for (const c of validCandidates) {
        if (seen.has(c.toLowerCase())) return `Duplicate: "${c}".`
        seen.add(c.toLowerCase())
      }
      return ''
    })(),
    // step 2: voting
    (() => {
      if (votingMode === 'multiple' && validCandidates.length > 0 && multipleK > validCandidates.length)
        return `K cannot exceed ${validCandidates.length} options.`
      if (votingMode === 'cumulative') {
        if (totalVotes < 2) return 'Min 2 total votes.'
        if (maxPerCand < 1 || maxPerCand > totalVotes) return 'Cap must be 1–total.'
      }
      return ''
    })(),
    // step 3: duration
    (!regDays || regDays < 1) ? 'Min 1 day for Registration.' :
    (!voteDays || voteDays < 1) ? 'Min 1 day for Voting.' :
    (!revealDays || revealDays < 1) ? 'Min 1 day for Reveal.' : '',
  ], [proposal, candidates, validCandidates, votingMode, multipleK, totalVotes, maxPerCand, regDays, voteDays, revealDays])

  const canNext = !stepErrors[step]
  const allValid = stepErrors.every(e => !e)

  const create = async () => {
    console.log("Create poll clicked. signer:", !!signer, "allValid:", allValid);
    if (!signer || !allValid) return
    const tv  = votingMode === 'single' ? 1 : votingMode === 'multiple' ? multipleK : totalVotes
    const mpc = votingMode === 'cumulative' ? maxPerCand : 1
    setBusy(true); setError(null); setInfo(null)
    try {
      console.log("Getting fee data...");
      const factory = new Contract(appConfig.factoryAddress, FACTORY_ABI, signer)
      const now = Math.floor(Date.now() / 1000)
      const feeData = await signer.provider!.getFeeData()
      const gasOverrides = feeData.maxFeePerGas ? { maxFeePerGas: feeData.maxFeePerGas * 130n / 100n } : {}
      console.log("Gas overrides:", gasOverrides);
      const tx = await factory.createPoll(
        mode === 'OPEN' ? ELIGIBILITY_MODE.OPEN : ELIGIBILITY_MODE.ADMIN_APPROVED,
        proposal, validCandidates,
        BigInt(now + regDays * DAY),
        BigInt(now + (regDays + voteDays) * DAY),
        BigInt(now + (regDays + voteDays + revealDays) * DAY),
        tv, mpc, allowAbstain, isWeighted, gasOverrides,
      )
      setInfo(`Submitted: ${tx.hash}`)
      const receipt = await tx.wait()
      const ev = receipt.logs
        .map((l: { topics: string[]; data: string }) => { try { return factory.interface.parseLog(l) } catch { return null } })
        .find((p: { name: string } | null) => p && p.name === 'PollCreated')
      if (ev) {
        const pool = (ev as { args: { pool: string; pollId: bigint } }).args.pool
        const id   = (ev as { args: { pool: string; pollId: bigint } }).args.pollId
        setInfo(`Poll #${id} created!\nPool: ${pool}`)
      }
    } catch (e) {
      console.error("Deploy error:", e);
      setError(formatContractError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full divide-x divide-gray-100">

      {/* ═══ LEFT: wizard ═══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col">

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 pt-5 pb-4 border-b border-gray-100">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <button onClick={() => { if (i < step || !stepErrors[i]) setStep(i) }}
                className="flex items-center gap-2 group">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i < step    ? 'bg-[hsl(var(--primary))] text-white'
                  : i === step ? 'bg-[hsl(var(--primary))] text-white ring-4 ring-blue-100'
                  : 'bg-gray-100 text-gray-400'
                }`}>
                  {i < step
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-[hsl(var(--primary))]' : i < step ? 'text-gray-500' : 'text-gray-300'}`}>
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-[hsl(var(--primary))]' : 'bg-gray-100'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 px-6 py-5">

          {/* ── Step 0: Proposal ── */}
          {step === 0 && (
            <div className="space-y-4 max-w-lg">
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-0.5">What is this poll about?</h3>
                <p className="text-xs text-gray-400">Write a clear title voters will understand.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Proposal title</label>
                <input value={proposal} onChange={e => setProposal(e.target.value)}
                  placeholder="e.g. Should we adopt this proposal?"
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-colors ${
                    proposal && !proposal.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50 focus:ring-blue-100'
                  }`} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Eligibility</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'OPEN',           title: 'Open DAO',     desc: 'Anyone may register once' },
                    { value: 'ADMIN_APPROVED', title: 'Permissioned', desc: 'Requires admin-signed coupon' },
                  ].map(({ value, title, desc }) => (
                    <button key={value} type="button" onClick={() => setMode(value as 'OPEN' | 'ADMIN_APPROVED')}
                      className={`text-left px-4 py-3 rounded-xl border transition-all ${
                        mode === value ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}>
                      <p className={`text-sm font-semibold ${mode === value ? 'text-blue-700' : 'text-gray-700'}`}>{title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Options ── */}
          {step === 1 && (
            <div className="space-y-4 max-w-lg">
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-0.5">What are the choices?</h3>
                <p className="text-xs text-gray-400">Add the options voters can pick from. Max {MAX_OPTIONS}.</p>
              </div>
              <div className="space-y-1.5">
                {candidates.map((val, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                      style={{ background: CAND_COLORS[i % CAND_COLORS.length] }}>{i + 1}</span>
                    <input type="text" value={val} onChange={e => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-colors" />
                    <button type="button" onClick={() => removeOption(i)} disabled={candidates.length <= 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-20 disabled:pointer-events-none transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addOption} disabled={candidates.length >= MAX_OPTIONS}
                  className="w-full py-2 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 disabled:opacity-30 disabled:pointer-events-none transition-all">
                  + {candidates.length >= MAX_OPTIONS ? 'Limit reached' : 'Add option'}
                </button>
              </div>
              <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                <input type="checkbox" checked={allowAbstain} onChange={e => setAllowAbstain(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Include "Abstain" option</p>
                  <p className="text-xs text-gray-400">Added automatically at slot 0</p>
                </div>
              </label>
              {stepErrors[1] && <p className="text-xs text-red-500">{stepErrors[1]}</p>}
            </div>
          )}

          {/* ── Step 2: Voting type ── */}
          {step === 2 && (
            <div className="space-y-4 max-w-lg">
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-0.5">How should votes be counted?</h3>
                <p className="text-xs text-gray-400">Choose the voting mechanism for this poll.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'single',     title: 'Single',     desc: 'Pick exactly 1' },
                  { key: 'multiple',   title: 'Multiple',   desc: 'Pick up to K' },
                  { key: 'cumulative', title: 'Cumulative', desc: 'Spread N votes' },
                ] as const).map(({ key, title, desc }) => (
                  <button key={key} type="button" onClick={() => setVotingMode(key)}
                    className={`text-left px-3 py-3 rounded-xl border transition-all ${
                      votingMode === key ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}>
                    <p className={`text-sm font-semibold ${votingMode === key ? 'text-blue-700' : 'text-gray-700'}`}>{title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>

              {votingMode === 'multiple' && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Max selections (K)</p>
                    <p className="text-xs text-gray-400">≤ {validCandidates.length || '?'} options</p>
                  </div>
                  <NumStepper value={multipleK} min={2} max={validCandidates.length || 7}
                    onChange={v => setMultipleK(v)} />
                </div>
              )}

              {votingMode === 'cumulative' && (
                <div className="space-y-2">
                  {[
                    { label: 'Total votes per voter', desc: 'E.g. 10, 100 (max 255)', val: totalVotes, min: 2, max: 255,
                      onChange: (v: number) => { setTotalVotes(v); setMaxPerCand(Math.min(maxPerCand, v)) }, err: stepErrors[2] },
                    { label: 'Cap per candidate', desc: 'Equal to total = no cap', val: maxPerCand, min: 1, max: totalVotes,
                      onChange: setMaxPerCand, err: '' },
                  ].map(({ label, desc, val, min, max, onChange }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{label}</p>
                        <p className="text-xs text-gray-400">{desc}</p>
                      </div>
                      <NumStepper value={val} min={min} max={max} onChange={onChange} />
                    </div>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                <input type="checkbox" checked={isWeighted} onChange={e => setIsWeighted(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Weighted voting</p>
                  <p className="text-xs text-gray-400">Admin assigns a vote multiplier per voter</p>
                </div>
              </label>
              {stepErrors[2] && <p className="text-xs text-red-500">{stepErrors[2]}</p>}
            </div>
          )}

          {/* ── Step 3: Duration + confirm ── */}
          {step === 3 && (
            <div className="space-y-4 max-w-lg">
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-0.5">How long is each phase?</h3>
                <p className="text-xs text-gray-400">Phases run sequentially after the poll is deployed.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Registration', value: regDays,    set: setRegDays,    color: 'text-blue-600',   errKey: 0 },
                  { label: 'Voting',       value: voteDays,   set: setVoteDays,   color: 'text-violet-600', errKey: 1 },
                  { label: 'Reveal',       value: revealDays, set: setRevealDays, color: 'text-orange-600', errKey: 2 },
                ].map(({ label, value, set, color }) => (
                  <div key={label} className="space-y-1.5">
                    <p className={`text-xs font-semibold ${color}`}>{label}</p>
                    <div className="flex items-center gap-1.5">
                      <NumStepper value={value} min={1} max={365} onChange={set} />
                      <span className="text-xs text-gray-400 shrink-0">days</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Timeline bar */}
              <div className="space-y-1.5">
                {[
                  { label: 'Registration', days: regDays,    color: 'bg-blue-500' },
                  { label: 'Voting',       days: voteDays,   color: 'bg-violet-500' },
                  { label: 'Reveal',       days: revealDays, color: 'bg-orange-500' },
                ].map(({ label, days, color }) => {
                  const total = regDays + voteDays + revealDays
                  const pct = total > 0 ? Math.round(days / total * 100) : 0
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-24 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-600 w-8 text-right">{days}d</span>
                    </div>
                  )
                })}
                <p className="text-xs text-gray-400 pt-1">Total: <strong className="text-gray-700">{regDays + voteDays + revealDays} days</strong></p>
              </div>

              {stepErrors[3] && <p className="text-xs text-red-500">{stepErrors[3]}</p>}

              {/* Final submit */}
              <div className="pt-2">
                <button onClick={create} disabled={busy || !allValid}
                  className="w-full py-3 bg-[hsl(var(--primary))] text-white text-sm font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                  {busy
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Deploying…</>
                    : 'Deploy Poll'}
                </button>
                {info  && <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl whitespace-pre-line break-all">{info}</div>}
                {error && <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-xs p-3 rounded-xl break-all">{error}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Step nav buttons */}
        <div className="px-6 pb-5 flex items-center justify-between border-t border-gray-100 pt-4">
          <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none transition-colors">
            ← Back
          </button>
          <span className="text-xs text-gray-400">{step + 1} / {STEPS.length}</span>
          {step < STEPS.length - 1 && (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
              className="px-5 py-2 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next →
            </button>
          )}
          {step === STEPS.length - 1 && <span />}
        </div>
      </div>

      {/* ═══ RIGHT: summary ═════════════════════════════════════════════ */}
      <div className="w-64 shrink-0 p-5 bg-gray-50 flex flex-col gap-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Summary</p>

        {/* Poll card mini-preview */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="h-1 bg-gradient-to-r from-blue-500 to-violet-500" />
          <div className="p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2 min-h-[32px]">
              {proposal || <span className="text-gray-300 italic font-normal">No title yet…</span>}
            </p>
            <div className="flex flex-wrap gap-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${mode === 'OPEN' ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'}`}>
                {mode === 'OPEN' ? 'Open DAO' : 'Permissioned'}
              </span>
              {isWeighted && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">Weighted</span>}
            </div>
            <div className="space-y-1">
              {(allowAbstain ? ['Abstain', ...validCandidates] : validCandidates).slice(0, 5).map((name, i) => {
                const ci = allowAbstain ? i - 1 : i
                const color = ci < 0 ? '#9ca3af' : CAND_COLORS[ci % CAND_COLORS.length]
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[10px] text-gray-600 truncate">{name}</span>
                  </div>
                )
              })}
              {validCandidates.length === 0 && <p className="text-[10px] text-gray-300 italic">Add options…</p>}
            </div>
          </div>
        </div>

        {/* Config rows */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm text-xs">
          {[
            { label: 'Voting',   value: votingMode === 'single' ? 'Single' : votingMode === 'multiple' ? `Multiple (K=${multipleK})` : `Cumulative (${totalVotes}v)` },
            { label: 'Abstain', value: allowAbstain ? 'Yes' : 'No' },
            { label: 'Duration', value: `${regDays + voteDays + revealDays} days` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between px-3 py-2">
              <span className="text-gray-400">{label}</span>
              <span className="font-semibold text-gray-700">{value}</span>
            </div>
          ))}
        </div>

        {/* Step checklist */}
        <div className="space-y-1.5">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                !stepErrors[i] ? 'bg-emerald-500' : i === step ? 'bg-blue-500' : 'bg-gray-200'
              }`}>
                {!stepErrors[i]
                  ? <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span className="text-white text-[8px] font-bold">{i + 1}</span>}
              </div>
              <span className={`text-xs ${!stepErrors[i] ? 'text-emerald-600 font-medium' : i === step ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {stepErrors[i] && i !== step && (
                <span className="text-[10px] text-red-400 ml-auto">incomplete</span>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
