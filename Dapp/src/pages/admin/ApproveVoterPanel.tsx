import { useState } from 'react'
import { useWalletCtx } from '@/context/WalletContext'
import { signVoterApproval, packCoupon } from '@/lib/eip712'
import { formatContractError } from '@/lib/ethersError'

const DAY = 24 * 60 * 60

export function ApproveVoterPanel() {
  const { signer, chainId } = useWalletCtx()
  const [pool, setPool] = useState('')
  const [voter, setVoter] = useState('')
  const [days, setDays] = useState(7)
  const [coupon, setCoupon] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const sign = async () => {
    if (!signer || !chainId) return
    setError(null); setCoupon(null)
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + days * DAY)
      const sig = await signVoterApproval(signer, chainId, pool, { voter, pool, deadline })
      const c = packCoupon({ voter, pool, deadline }, sig)
      setCoupon(JSON.stringify(c, null, 2))
    } catch (e) {
      setError(formatContractError(e))
    }
  }

  const copy = async () => {
    if (!coupon) return
    await navigator.clipboard.writeText(coupon)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Approve a Voter</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Sign an off-chain EIP-712 <code className="bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded text-xs font-mono">VoterApproval</code> coupon.
          Send the JSON to the voter — they paste it in the Register tab.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 space-y-1.5">
        <p className="font-semibold text-sm">How Company mode works</p>
        <div className="flex items-start gap-2"><span className="shrink-0 font-bold">1.</span><span>Enter the pool address and the voter's wallet address below.</span></div>
        <div className="flex items-start gap-2"><span className="shrink-0 font-bold">2.</span><span>Click "Sign approval" — MetaMask will ask you to sign an EIP-712 message (no gas cost).</span></div>
        <div className="flex items-start gap-2"><span className="shrink-0 font-bold">3.</span><span>Copy the JSON coupon and send it securely to the voter.</span></div>
        <div className="flex items-start gap-2"><span className="shrink-0 font-bold">4.</span><span>The voter pastes the coupon in the Register tab to prove eligibility.</span></div>
      </div>

      <div className="space-y-4">
        {/* Pool address */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Pool address</label>
          <input
            placeholder="0x…"
            value={pool}
            onChange={(e) => setPool(e.target.value.trim())}
            className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:bg-white transition-colors"
          />
        </div>

        {/* Voter address */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Voter address</label>
          <input
            placeholder="0x…"
            value={voter}
            onChange={(e) => setVoter(e.target.value.trim())}
            className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:bg-white transition-colors"
          />
        </div>

        {/* Validity */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
            Coupon validity <span className="text-[hsl(var(--muted-foreground))] font-normal">(days)</span>
          </label>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Sign button */}
      <button
        onClick={sign}
        disabled={!pool || !voter}
        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Sign approval coupon
      </button>

      {/* Coupon output */}
      {coupon && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">Signed Coupon JSON</label>
            <button
              onClick={copy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                copied
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="bg-[hsl(var(--muted))] rounded-xl p-3 border border-[hsl(var(--border))]">
            <pre className="text-xs font-mono text-[hsl(var(--foreground))] overflow-auto whitespace-pre-wrap break-all max-h-48">
              {coupon}
            </pre>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Send this JSON securely to the voter. Do not share publicly — it is valid until the deadline.
          </p>
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
