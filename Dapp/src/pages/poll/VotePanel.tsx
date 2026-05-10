import { useEffect, useState } from 'react'
import { Contract } from 'ethers'
import { useWalletCtx } from '@/context/WalletContext'
import { POOL_ABI, PHASE } from '@/lib/abi'
import { identityFromFile, commitmentOf, nullifierHashOf, saveBallotBackup, type VoterIdentity } from '@/lib/identity'
import { syncTree } from '@/lib/merkleSync'
import { buildCircuitInput, generateVoteProof, detectMode } from '@/lib/proof'
import { formatContractError } from '@/lib/ethersError'
import type { PoolMeta } from '../PollPage'

type Props = { pool: string; meta: PoolMeta; onChanged: () => void }

const IDENTITY_KEY     = (pool: string, account: string) => `zk-vote-identity:${pool.toLowerCase()}:${account.toLowerCase()}`
const IDENTITY_KEY_OLD = (pool: string) => `zk-vote-identity:${pool.toLowerCase()}`
const HAS_VOTED_KEY = (pool: string, nh: string) => `zk-vote-voted:${pool.toLowerCase()}:${nh}`

const STEPS = [
  { key: 'circuit', label: 'Preparing circuit input',    desc: 'Syncing Merkle tree and computing inputs…' },
  { key: 'proof',   label: 'Generating ZK proof',        desc: 'Running Groth16 in-browser. Please wait…' },
  { key: 'tx',      label: 'Sending transaction',        desc: 'Confirm in MetaMask and wait for confirmation…' },
]

export function VotePanel({ pool, meta, onChanged }: Props) {
  const { signer, provider, account } = useWalletCtx()
  const [identity, setIdentity]       = useState<VoterIdentity | null>(null)
  // votes[i] = weight for slot i (0 = abstain)
  const [votes, setVotes]             = useState<number[]>(() => Array(meta.candidates.length).fill(0))
  const [isAbstain, setIsAbstain]     = useState(false)
  const [hasVoted, setHasVoted]       = useState<boolean | null>(null) // null = checking
  const [busy, setBusy]               = useState(false)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [elapsed, setElapsed]         = useState(0)   // seconds since proof started
  const [proofStart, setProofStart]   = useState<number | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [info, setInfo]               = useState<string | null>(null)

  useEffect(() => {
    if (!account) return
    const key = IDENTITY_KEY(pool, account)
    const raw = localStorage.getItem(key)
      ?? localStorage.getItem(IDENTITY_KEY_OLD(pool))
    if (!raw) return
    try {
      const id = identityFromFile(JSON.parse(raw))
      setIdentity(id)
      // Migrate old key → new key (only when account is known)
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, raw)
        localStorage.removeItem(IDENTITY_KEY_OLD(pool))
      }
    } catch { /* ignore */ }
  }, [pool, account])

  // Check if already voted — localStorage cache first, then RPC fallback
  useEffect(() => {
    if (!identity || !provider) return
    let alive = true
    ;(async () => {
      const nh = (await nullifierHashOf(identity)).toString()
      // 1. Check localStorage cache (avoids RPC on revisit)
      if (localStorage.getItem(HAS_VOTED_KEY(pool, nh)) === '1') {
        if (alive) setHasVoted(true)
        return
      }
      // 2. Ask the contract
      try {
        const c    = new Contract(pool, POOL_ABI, provider)
        const used = await c.nullifierUsed(BigInt(nh))
        if (!alive) return
        setHasVoted(Boolean(used))
        if (used) localStorage.setItem(HAS_VOTED_KEY(pool, nh), '1')
      } catch {
        if (alive) setHasVoted(false) // assume not voted on RPC error
      }
    })()
    return () => { alive = false }
  }, [identity, provider, pool])

  // Reset votes when candidates change
  useEffect(() => {
    setVotes(Array(meta.candidates.length).fill(0))
  }, [meta.candidates.length])

  // Elapsed timer — runs only during proof generation step
  useEffect(() => {
    if (currentStep !== 'proof') { setElapsed(0); return }
    setProofStart(Date.now())
    const id = setInterval(() => {
      setElapsed(s => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [currentStep])

  const phaseOk        = meta.phase === PHASE.Voting
  const votingMode     = detectMode(meta.totalVotes, meta.maxPerCandidate)
  const realSum        = votes.slice(1).reduce((a, b) => a + b, 0)
  const remaining      = meta.totalVotes - realSum
  const canSubmit      = phaseOk && identity && !hasVoted && (isAbstain || realSum > 0)

  // ── Single / Multiple: toggle candidate (binary) ───────────────────
  const toggleCandidate = (idx: number) => {
    if (isAbstain) setIsAbstain(false)
    setVotes(prev => {
      const next = [...prev]
      if (votingMode === 'single') {
        // Clear all, select this one
        next.fill(0)
        next[idx] = 1
      } else {
        // Multiple: toggle, respect totalVotes cap
        if (next[idx] === 1) {
          next[idx] = 0
        } else if (realSum < meta.totalVotes) {
          next[idx] = 1
        }
      }
      return next
    })
  }

  // ── Cumulative: adjust a slot by delta ─────────────────────────────
  const adjustVote = (idx: number, delta: number) => {
    if (isAbstain) setIsAbstain(false)
    setVotes(prev => {
      const next = [...prev]
      const newVal = Math.max(0, Math.min(meta.maxPerCandidate, next[idx] + delta))
      const newSum = realSum - next[idx] + newVal
      if (newSum > meta.totalVotes) return prev   // over budget
      next[idx] = newVal
      return next
    })
  }

  const handleAbstain = () => {
    setVotes(Array(meta.candidates.length).fill(0))
    setIsAbstain(true)
  }

  const handleVote = async () => {
    if (!signer || !provider || !identity || !canSubmit) return
    setBusy(true); setError(null); setInfo(null)
    try {
      setCurrentStep('circuit')
      const c = new Contract(pool, POOL_ABI, signer)
      const chainRoot: bigint = await c.getRoot()
      const { tree, indexByCommitment } = await syncTree(pool, provider)
      const myCommit = await commitmentOf(identity)
      const idx = indexByCommitment.get(myCommit.toString())
      if (idx === undefined) throw new Error('Commitment not found in on-chain tree')
      if (tree.root !== chainRoot) throw new Error('Synced root mismatches on-chain root — refresh and try again')

      // Build votes array: index 0 = abstain slot
      const votesArr = Array(meta.candidates.length).fill(0)
      if (isAbstain) {
        votesArr[0] = meta.totalVotes  // put all weight in abstain slot
      } else {
        votes.forEach((v, i) => { votesArr[i] = v })
      }

      const circuitIn = await buildCircuitInput({
        chainRoot,
        secret:          identity.secret,
        nullifier:       identity.nullifier,
        votes:           votesArr,
        numCandidates:   BigInt(meta.candidates.length),
        totalVotes:      BigInt(meta.totalVotes),
        maxPerCandidate: BigInt(meta.maxPerCandidate),
        allowAbstain:    meta.allowAbstain,
        pool,
        tree,
        leafIndex: idx,
      })

      setCurrentStep('proof')
      const { pA, pB, pC, pubSignals } = await generateVoteProof(circuitIn)

      setCurrentStep('tx')
      const feeData = await signer.provider!.getFeeData()
      const gasOverrides = feeData.maxFeePerGas ? { maxFeePerGas: feeData.maxFeePerGas * 130n / 100n } : {}
      const tx = await c.castVote(pA, pB, pC, pubSignals, gasOverrides)
      setInfo(`Transaction submitted: ${tx.hash}`)
      await tx.wait()

      const votes8 = circuitIn.votes.map(Number)
      saveBallotBackup({
        pool,
        nullifierHash:  circuitIn.nullifierHash,
        votes:          votes8,
        blinding:       circuitIn.blinding,
        voteCommitment: circuitIn.voteCommitment,
        createdAt:      new Date().toISOString(),
      })

      // Cache voted status — no need to call RPC next time
      localStorage.setItem(HAS_VOTED_KEY(pool, circuitIn.nullifierHash), '1')
      setHasVoted(true)

      setInfo('Vote committed! Return during the Reveal phase to reveal your vote.')
      setCurrentStep('')
      onChanged()
    } catch (e) {
      setError(formatContractError(e))
    } finally {
      setBusy(false)
    }
  }

  // ── Mode label ─────────────────────────────────────────────────────
  const modeLabel =
    votingMode === 'single'     ? 'Select 1 candidate.' :
    votingMode === 'multiple'   ? `Select up to ${meta.totalVotes} candidates.` :
    meta.maxPerCandidate === meta.totalVotes
      ? `Distribute ${meta.totalVotes} votes across candidates.`
      : `Distribute ${meta.totalVotes} votes (max ${meta.maxPerCandidate} per candidate).`

  return (
    <div className="px-5 pb-5 space-y-4">
      <p className="text-xs text-gray-500">{modeLabel}</p>

      {/* Warnings */}
      {!identity && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-3">
          No identity — register first or import backup.
        </div>
      )}
      {!phaseOk && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-3">
          Voting is not open in the current phase.
        </div>
      )}
      {hasVoted && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-4">
          <div>
            <p className="font-semibold">You have already voted in this poll.</p>
            <p className="text-xs mt-0.5 text-emerald-700">
              Switch to the <strong>Reveal</strong> tab when the Reveal phase begins to have your vote counted.
            </p>
          </div>
        </div>
      )}
      {hasVoted === null && identity && (
        <div className="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-sm rounded-xl p-3 flex gap-2 items-center">
          <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
          Checking vote status…
        </div>
      )}

      {/* Cumulative budget bar */}
      {votingMode === 'cumulative' && !isAbstain && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-[hsl(var(--muted-foreground))]">Votes remaining</span>
            <span className={remaining === 0 ? 'text-emerald-600' : 'text-[hsl(var(--primary))]'}>
              {remaining} / {meta.totalVotes}
            </span>
          </div>
          <div className="h-2 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
            <div
              className="h-full bg-[hsl(var(--primary))] rounded-full transition-all duration-200"
              style={{ width: `${((meta.totalVotes - remaining) / meta.totalVotes) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Multiple choice counter */}
      {votingMode === 'multiple' && !isAbstain && (
        <div className={`text-sm px-3 py-2 rounded-xl border ${
          realSum >= meta.totalVotes
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-[hsl(var(--muted))] border-transparent text-[hsl(var(--muted-foreground))]'
        }`}>
          Selected <strong>{realSum}</strong> / {meta.totalVotes}
        </div>
      )}

      {/* Candidate list */}
      <div className="space-y-2">
        {meta.candidates.slice(1).map((name, zeroIdx) => {
          const idx     = zeroIdx + 1
          const weight  = votes[idx] ?? 0
          const checked = weight > 0

          if (votingMode === 'single' || votingMode === 'multiple') {
            const isDisabled = !isAbstain && !checked && realSum >= meta.totalVotes
            return (
              <label key={idx} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                isAbstain     ? 'opacity-40 pointer-events-none border-[hsl(var(--border))] bg-white'
                : checked     ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]'
                : isDisabled  ? 'opacity-40 cursor-not-allowed border-[hsl(var(--border))] bg-white'
                : 'border-[hsl(var(--border))] bg-white hover:border-blue-200 hover:bg-blue-50'
              }`}>
                {votingMode === 'multiple' ? (
                  <input type="checkbox" checked={checked} disabled={isDisabled || !phaseOk}
                    onChange={() => toggleCandidate(idx)}
                    className="w-4 h-4 accent-[hsl(var(--primary))] shrink-0" />
                ) : (
                  <>
                    <input type="radio" name="candidate" value={String(idx)} checked={checked}
                      onChange={() => toggleCandidate(idx)} className="hidden" />
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      checked ? 'border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))]'
                    }`}>
                      {checked && <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--primary))]" />}
                    </div>
                  </>
                )}
                <span className={`text-sm font-medium flex-1 ${checked ? 'text-[hsl(var(--primary))]' : ''}`}>{name}</span>
                {checked && <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />}
              </label>
            )
          }

          // Cumulative mode
          const pct = meta.totalVotes > 0 ? Math.round((weight / meta.totalVotes) * 100) : 0
          return (
            <div key={idx} className={`p-3 rounded-xl border transition-all ${
              isAbstain ? 'opacity-40 pointer-events-none border-[hsl(var(--border))] bg-white'
              : weight > 0 ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]'
              : 'border-[hsl(var(--border))] bg-white'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium flex-1 text-[hsl(var(--foreground))]">{name}</span>
                {/* Percentage */}
                <span className="text-xs text-[hsl(var(--muted-foreground))] w-8 text-right">{pct}%</span>
                {/* Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => adjustVote(idx, -1)} disabled={weight === 0 || !phaseOk}
                    className="w-7 h-7 rounded-lg border border-[hsl(var(--border))] bg-white text-sm font-bold text-[hsl(var(--muted-foreground))] hover:border-blue-300 hover:text-[hsl(var(--primary))] disabled:opacity-30 disabled:pointer-events-none transition-all">
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums text-[hsl(var(--foreground))]">
                    {weight}
                  </span>
                  <button type="button"
                    onClick={() => adjustVote(idx, 1)}
                    disabled={weight >= meta.maxPerCandidate || remaining === 0 || !phaseOk}
                    className="w-7 h-7 rounded-lg border border-[hsl(var(--border))] bg-white text-sm font-bold text-[hsl(var(--muted-foreground))] hover:border-blue-300 hover:text-[hsl(var(--primary))] disabled:opacity-30 disabled:pointer-events-none transition-all">
                    +
                  </button>
                </div>
              </div>
              {/* Mini bar for cumulative */}
              {weight > 0 && (
                <div className="mt-2 h-1 bg-blue-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[hsl(var(--primary))] rounded-full transition-all duration-200"
                    style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Abstain button */}
      {meta.allowAbstain && (
        <button type="button" onClick={handleAbstain} disabled={!phaseOk}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            isAbstain
              ? 'border-gray-400 bg-gray-100 text-gray-700'
              : 'border-[hsl(var(--border))] bg-white text-[hsl(var(--muted-foreground))] hover:border-gray-300 hover:bg-gray-50'
          }`}>
          Abstain
        </button>
      )}

      {/* Progress steps */}
      {busy && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          {STEPS.map(({ key, label, desc }) => {
            const si     = STEPS.findIndex(s => s.key === currentStep)
            const ti     = STEPS.findIndex(s => s.key === key)
            const done   = si > ti
            const active = currentStep === key

            return (
              <div key={key} className="space-y-1">
                <div className={`flex items-center gap-2 text-sm font-medium ${
                  active ? 'text-blue-700' : done ? 'text-emerald-600' : 'text-[hsl(var(--muted-foreground))]'
                }`}>
                  {done   ? <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0"><svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                   : active ? <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                   : <span className="w-4 h-4 rounded-full border-2 border-[hsl(var(--border))] shrink-0" />}
                  {label}
                  {/* Timer — only shown during proof step */}
                  {active && key === 'proof' && elapsed > 0 && (
                    <span className="ml-auto text-xs text-blue-500 tabular-nums font-normal">
                      {elapsed}s
                    </span>
                  )}
                </div>

                {/* Description + progress bar cho bước proof */}
                {active && (
                  <div className="ml-6 space-y-1.5">
                    <p className="text-xs text-blue-600">{desc}</p>
                    {key === 'proof' && (
                      <div className="space-y-1">
                        {/* Progress bar chạy từ 0→90% trong ~15s, dừng ở 90% cho đến khi xong */}
                        <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${Math.min(90, (elapsed / 15) * 90)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-blue-400">
                          Estimated 15–20 s depending on your device. Do not close this tab.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {currentStep === 'tx' && proofStart && (
            <p className="text-xs text-emerald-600 ml-6">
              Proof generated in {Math.round((Date.now() - proofStart) / 1000)}s
            </p>
          )}
        </div>
      )}

      {/* Submit */}
      <button onClick={handleVote} disabled={!canSubmit || busy}
        className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {busy ? (
          <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
        ) : isAbstain ? 'Submit blank ballot'
          : votingMode === 'cumulative' ? `Cast vote (${meta.totalVotes - remaining}/${meta.totalVotes} allocated)`
          : votingMode === 'multiple'   ? `Cast vote (${realSum} candidate${realSum !== 1 ? 's' : ''} selected)`
          : 'Cast vote'}
      </button>

      {info  && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl break-all">{info}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl break-all">{error}</div>}
    </div>
  )
}
