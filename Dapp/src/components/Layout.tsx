import { NavLink, Outlet } from 'react-router-dom'
import { LandingHero } from './LandingHero'
import { useWallet } from '@/hooks/useWallet'
import { WalletContext } from '@/context/WalletContext'
import { shortAddr } from '@/lib/utils'
import { useWalletInfo } from '@web3modal/ethers/react'

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum', 11155111: 'Sepolia', 137: 'Polygon',
  42161: 'Arbitrum', 421614: 'Arb Sepolia', 31337: 'Localhost',
}

const NAV_ITEMS = [
  {
    to: '/', end: true, label: 'Polls',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    to: '/admin', end: false, label: 'Admin',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export function Layout() {
  const wallet = useWallet()
  const { walletInfo } = useWalletInfo()

  if (!wallet.account) {
    return (
      <WalletContext.Provider value={wallet}>
        <LandingHero />
      </WalletContext.Provider>
    )
  }

  const chainName = wallet.chainId ? (CHAIN_NAMES[wallet.chainId] ?? `Chain ${wallet.chainId}`) : null

  return (
    <WalletContext.Provider value={wallet}>
      <div className="min-h-screen flex bg-[hsl(var(--background))]">

        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <aside className="w-56 shrink-0 flex flex-col bg-white border-r border-gray-200 fixed top-0 left-0 h-full z-40">
          {/* Logo */}
          <div className="px-5 py-5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center shadow-sm shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="font-bold text-gray-900 text-base tracking-tight">ZK Vote</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV_ITEMS.map(({ to, end, label, icon }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[hsl(var(--accent))] text-[hsl(var(--primary))]'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`
                }>
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-[hsl(var(--primary))]' : 'text-gray-400'}>{icon}</span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Bottom: network + version */}
          <div className="px-4 py-4 border-t border-gray-100 space-y-2">
            {wallet.isCorrectChain ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {chainName}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Wrong network
              </div>
            )}
            <p className="text-[10px] text-gray-300">Groth16 ZK-SNARK · HCMUT 2025</p>
          </div>
        </aside>

        {/* ── Main area ─────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col ml-56">

          {/* Top bar */}
          <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-8 h-14 flex items-center justify-end gap-3">
            {/* Wallet */}
            <div className="flex items-center gap-2">
              <div 
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full cursor-pointer hover:bg-blue-100 transition-colors group relative"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(wallet.account!)
                    alert("Đã copy: " + wallet.account)
                  } catch (e) {
                    prompt("Tính năng copy tự động bị chặn. Hãy bôi đen và nhấn Ctrl+C:", wallet.account!)
                  }
                }}
                title="Click để copy địa chỉ đầy đủ"
              >
                {walletInfo?.icon
                  ? <img src={walletInfo.icon} alt={walletInfo.name ?? 'wallet'} className="w-5 h-5 rounded-full shrink-0 object-cover" />
                  : <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 shrink-0" />
                }
                <span className="text-xs font-mono font-bold text-blue-700">
                  {shortAddr(wallet.account)}
                </span>
                {/* Tooltip */}
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
                  Click to copy
                </span>
              </div>
              <button onClick={wallet.disconnect}
                className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full border border-gray-200 transition-colors">
                Disconnect
              </button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-8 py-6">
            <Outlet />
          </main>

          {/* Footer */}
          <footer className="border-t border-gray-100 px-8 py-4">
            <p className="text-xs text-gray-300">ZK Voting · Groth16 ZK-SNARK · Arbitrum Sepolia · HCMUT 2025</p>
          </footer>
        </div>

      </div>
    </WalletContext.Provider>
  )
}
