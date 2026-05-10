import { useEffect, useState } from 'react'
import { Contract } from 'ethers'
import { useWalletCtx } from '@/context/WalletContext'
import { POOL_ABI, PHASE } from '@/lib/abi'
import { loadBallotBackup, clearBallotBackup, type BallotBackup } from '@/lib/identity'
import { formatContractError } from '@/lib/ethersError'
import type { PoolMeta } from '../PollPage'

type Props = { pool: string; meta: PoolMeta; onChanged: () => void; onRevealed?: () => void }

export function RevealPanel({ pool, meta, onChanged, onRevealed }: Props) {
  const { signer } = useWalletCtx()
  const [backup, setBackup]           = useState<BallotBackup | null>(null)
  const [busy, setBusy]               = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [info, setInfo]               = useState<string | null>(null)
  const [revealedFlag, setRevealedFlag] = useState<boolean | null>(null)

  useEffect(() => { setBackup(loadBallotBackup(pool)) }, [pool])

  useEffect(() => {
    if (!signer || !backup) return
    const c = new Contract(pool, POOL_ABI, signer)
    c.revealed(BigInt(backup.nullifierHash)).then(setRevealedFlag).catch(() => null)
  }, [signer, backup, pool])

  const phaseOk = meta.phase === PHASE.Reveal

  // Decode choices for display
  // Build display: name → vote weight
  const voteDisplay: { name: string; weight: number }[] = []
  if (backup?.votes) {
    backup.votes.forEach((v, i) => {
      if (v > 0) {
        voteDisplay.push({
          name: i === 0 ? 'Abstain' : (meta.candidates[i] ?? `Candidate ${i}`),
          weight: v,
        })
      }
    })
  }

  const handleReveal = async () => {
    if (!signer || !backup) return
    setBusy(true); setError(null); setInfo(null)
    try {
      const c = new Contract(pool, POOL_ABI, signer)
      // Pad choices to length 8 as uint256[]
      const choices8 = Array(8).fill(0n)
      backup.votes.forEach((v, i) => { choices8[i] = BigInt(v) })

      const feeData = await signer.provider!.getFeeData()
      const gasOverrides = feeData.maxFeePerGas ? { maxFeePerGas: feeData.maxFeePerGas * 130n / 100n } : {}
      const tx = await c.revealVote(
        BigInt(backup.nullifierHash),
        choices8,
        BigInt(backup.voteCommitment),
        gasOverrides,
      )
      setInfo(`Transaction submitted: ${tx.hash}`)
      await tx.wait()
      setInfo('Vote revealed successfully! Your vote is now counted.')
      clearBallotBackup(pool)
      setBackup(null)
      onRevealed?.()
      onChanged()
    } catch (e) {
      setError(formatContractError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-5 pb-5 space-y-4">

      {/* Status banners */}
      {!phaseOk && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-3">
          Reveal is not open in the current phase.
        </div>
      )}
      {revealedFlag && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
          This ballot has already been revealed.
        </div>
      )}

      {/* Ready-to-reveal callout */}
      {phaseOk && backup && revealedFlag === false && (
        <div className="bg-orange-50 border-2 border-orange-400 text-orange-900 text-sm rounded-xl p-4">
          <p className="font-semibold">Your ballot is waiting to be counted!</p>
          <p className="text-xs mt-0.5 text-orange-700">Click the button below to reveal your vote before the deadline.</p>
        </div>
      )}

      {/* No backup */}
      {!backup && (
        <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-1">No ballot backup found</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            If you voted from another browser or device, you will need to import your identity file and vote again from this device.
          </p>
        </div>
      )}

      {/* Ballot summary */}
      {backup && (
        <div className="bg-[hsl(var(--muted))] rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Your Ballot</p>

          {/* Selected candidates */}
          <div className="bg-white rounded-xl p-3 border border-[hsl(var(--border))]">
            <p className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-2">
              {voteDisplay.length === 0 ? 'No selection found'
               : voteDisplay[0].name === 'Abstain' ? 'Vote'
               : `Selected candidate${voteDisplay.length > 1 ? 's' : ''}`}
            </p>
            {voteDisplay.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {voteDisplay.map(({ name, weight }) => (
                  <span key={name} className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    name === 'Abstain'
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {name === 'Abstain' ? `Abstain${weight > 1 ? ` (${weight})` : ''}`
                      : weight > 1 ? `${name} (${weight} votes)` : name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-red-600">Ballot data may be corrupted.</p>
            )}
          </div>

          {/* Technical details */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              Show technical details
            </summary>
            <div className="mt-2 space-y-1.5">
              {[
                { label: 'Nullifier hash',  value: backup.nullifierHash },
                { label: 'Vote commitment',  value: backup.voteCommitment },
                { label: 'Voted at',         value: new Date(backup.createdAt).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-lg p-2 border border-[hsl(var(--border))]">
                  <p className="font-medium text-[hsl(var(--muted-foreground))] mb-0.5">{label}</p>
                  <p className="font-mono text-[hsl(var(--foreground))] break-all">{value}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleReveal}
        disabled={!backup || busy || !phaseOk || revealedFlag === true}
        className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white font-medium rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Submitting…
          </>
        ) : (
          <>Reveal vote</>
        )}
      </button>

      {info && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl break-all">
          {info}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl break-all">
          {error}
        </div>
      )}
    </div>
  )
}
