import { useEffect, useState } from 'react'
import { Contract } from 'ethers'
import { useWalletCtx } from '@/context/WalletContext'
import { POOL_ABI, ELIGIBILITY_MODE, PHASE } from '@/lib/abi'
import {
  newIdentity, identityToFile, identityFromFile, commitmentOf, nullifierHashOf, type VoterIdentity,
} from '@/lib/identity'
import { parseCoupon } from '@/lib/eip712'
import { formatContractError } from '@/lib/ethersError'
import type { PoolMeta } from '../PollPage'

type Props = { pool: string; meta: PoolMeta; onChanged: () => void }

const IDENTITY_KEY     = (pool: string, account: string) => `zk-vote-identity:${pool.toLowerCase()}:${account.toLowerCase()}`
const IDENTITY_KEY_OLD = (pool: string) => `zk-vote-identity:${pool.toLowerCase()}`

export function RegisterPanel({ pool, meta, onChanged }: Props) {
  const { signer, account } = useWalletCtx()
  const [identity, setIdentity]       = useState<VoterIdentity | null>(null)
  const [commitmentStr, setCommitmentStr] = useState<string>('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo]   = useState<string | null>(null)
  const [hasReg, setHasReg]     = useState(false)
  const [couponJson, setCouponJson] = useState('')

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

  useEffect(() => {
    if (!identity) return setCommitmentStr('')
    commitmentOf(identity).then(c => setCommitmentStr(c.toString()))
  }, [identity])

  useEffect(() => {
    if (!signer || !account) return
    const c = new Contract(pool, POOL_ABI, signer)
    c.hasRegistered(account).then((b: boolean) => setHasReg(b))
  }, [signer, account, pool])

  const handleGenerate = () => {
    const id = newIdentity()
    setIdentity(id)
    localStorage.setItem(IDENTITY_KEY(pool, account ?? ''), JSON.stringify(identityToFile(id, pool, 'KEEP THIS FILE SAFE')))
    setInfo('New identity generated and saved in browser.')
  }

  const handleDownload = () => {
    if (!identity) return
    const blob = new Blob([JSON.stringify(identityToFile(identity, pool), null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `voter-identity-${pool.slice(0, 8)}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (file: File) => {
    try {
      const id = identityFromFile(JSON.parse(await file.text()))
      setIdentity(id)
      localStorage.setItem(IDENTITY_KEY(pool, account ?? ''), JSON.stringify(identityToFile(id, pool, 'imported')))
      setInfo('Identity imported.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const handleRegister = async () => {
    if (!signer || !identity) return
    setBusy(true); setError(null); setInfo(null)
    try {
      const commitment    = await commitmentOf(identity)
      const nullifierHash = await nullifierHashOf(identity)
      const c = new Contract(pool, POOL_ABI, signer)
      let sigBytes = '0x'; let sigDl = 0n
      if (meta.mode === ELIGIBILITY_MODE.ADMIN_APPROVED) {
        const coupon = parseCoupon(couponJson.trim())
        if (coupon.voter.toLowerCase() !== (account || '').toLowerCase())
          throw new Error('Coupon is not for the connected account.')
        if (coupon.pool.toLowerCase() !== pool.toLowerCase())
          throw new Error('Coupon belongs to a different poll.')
        sigBytes = coupon.signature; sigDl = BigInt(coupon.deadline)
      }
      const feeData = await signer.provider!.getFeeData()
      const gasOverrides = feeData.maxFeePerGas ? { maxFeePerGas: feeData.maxFeePerGas * 130n / 100n } : {}
      const tx = await c.register(commitment, nullifierHash, sigBytes, sigDl, gasOverrides)
      setInfo(`Submitted: ${tx.hash}`)
      await tx.wait()
      setInfo('Registered on-chain!')
      onChanged()
    } catch (e) {
      setError(formatContractError(e))
    } finally { setBusy(false) }
  }

  const phaseOk = meta.phase === PHASE.Registration

  return (
    <div className="px-6 pb-6 space-y-4">

      {/* Status banners — only show if relevant */}
      {hasReg && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Already registered for this poll.
        </div>
      )}
      {!phaseOk && !hasReg && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Registration is not open in the current phase.
        </div>
      )}

      {/* Identity row — compact horizontal */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              identity ? 'bg-emerald-500' : 'bg-gray-300'
            }`}>
              {identity
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
              }
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                {identity ? 'Identity loaded' : 'No identity yet'}
              </p>
              <p className="text-[10px] text-gray-400">
                {identity ? 'Saved in browser localStorage' : 'Generate or import one below'}
              </p>
            </div>
          </div>
          {/* Action buttons inline */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={handleGenerate} disabled={busy || !phaseOk}
              className="px-2.5 py-1.5 bg-[hsl(var(--primary))] text-white text-xs font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {identity ? 'Regenerate' : 'Generate'}
            </button>
            <button onClick={handleDownload} disabled={!identity}
              className="px-2.5 py-1.5 bg-white border border-gray-200 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Backup
            </button>
            <label className="px-2.5 py-1.5 bg-white border border-gray-200 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
              <input type="file" accept="application/json" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleImport(f) }} />
              Import
            </label>
          </div>
        </div>

        {/* Commitment hash — only if loaded */}
        {commitmentStr && (
          <div className="bg-white rounded-lg border border-gray-200 px-2.5 py-1.5 font-mono text-[10px] break-all text-gray-500">
            <span className="text-gray-400 select-none">commitment = </span>{commitmentStr}
          </div>
        )}
      </div>

      {/* Coupon input — only for permissioned polls */}
      {meta.mode === ELIGIBILITY_MODE.ADMIN_APPROVED && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Admin Approval Coupon <span className="text-red-500">*</span>
          </label>
          <textarea
            placeholder='{"voter":"0x...","pool":"0x...","deadline":"...","signature":"0x..."}'
            value={couponJson}
            onChange={e => setCouponJson(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-mono text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
          />
          <p className="text-xs text-gray-400">
            Paste the JSON coupon signed by the poll admin for your wallet address.
          </p>
        </div>
      )}

      {/* Submit */}
      <button onClick={handleRegister} disabled={!identity || hasReg || busy || !phaseOk}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        {busy
          ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Submitting…</>
          : 'Submit commitment'}
      </button>

      {/* Feedback */}
      {info  && <p className="text-xs text-emerald-600 text-center">{info}</p>}
      {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs p-3 rounded-xl break-all">{error}</div>}
    </div>
  )
}
