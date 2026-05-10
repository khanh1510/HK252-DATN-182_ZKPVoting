import { Link, NavLink } from 'react-router-dom'
import { shortAddr } from '@/lib/utils'

type HeaderProps = {
  account: string | null
  chainId: number | null
  isCorrectChain: boolean
  connecting: boolean
  onConnect: () => void
  onDisconnect: () => void
}

const CHAIN_NAMES: Record<number, string> = {
  1:       'Ethereum',
  11155111:'Sepolia',
  137:     'Polygon',
  42161:   'Arbitrum',
  421614:  'Arb Sepolia',
  31337:   'Localhost',
}

export function Header({
  account,
  chainId,
  isCorrectChain,
  connecting,
  onConnect,
  onDisconnect,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[hsl(var(--border))]"
      style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="container mx-auto flex items-center justify-between px-6 h-16">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-semibold text-[hsl(var(--foreground))] text-base tracking-tight group-hover:text-[hsl(var(--primary))] transition-colors">
              ZK Vote
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[hsl(var(--accent))] text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
                }`
              }
            >
              Polls
            </NavLink>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[hsl(var(--accent))] text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
                }`
              }
            >
              Admin
            </NavLink>
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Chain badge */}
          {chainId !== null && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              isCorrectChain
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isCorrectChain ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isCorrectChain
                ? (CHAIN_NAMES[chainId!] ?? `Chain ${chainId}`)
                : `Wrong network (${CHAIN_NAMES[chainId!] ?? chainId})`}
            </div>
          )}

          {account ? (
            <div className="flex items-center gap-2">
              <div className="fixed inset-0 bg-white/95 z-[9999] flex flex-col items-center justify-center p-8 backdrop-blur-md">
                <h1 className="text-3xl font-bold text-red-600 mb-6">ĐÂY LÀ ĐỊA CHỈ VÍ CỦA BẠN!</h1>
                <p className="text-lg text-gray-700 mb-4 font-bold">Hãy dùng chuột <span className="underline">bôi đen</span> và copy chuỗi bên dưới (chắc chắn copy được):</p>
                <div 
                  className="text-4xl font-mono bg-gray-100 p-8 rounded-2xl border-4 border-dashed border-blue-500 text-blue-800 break-all select-all shadow-xl font-bold"
                  style={{ userSelect: 'all' }}
                >
                  {account}
                </div>
                <button
                  onClick={onDisconnect}
                  className="mt-12 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold"
                >
                  Đóng trang này (Disconnect)
                </button>
              </div>
              
              <div 
                className="flex items-center gap-2 px-3 py-1.5 bg-[hsl(var(--muted))] hover:bg-gray-200 cursor-pointer rounded-full transition-colors"
                title="Click to copy full address"
              >
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex-shrink-0" />
                <span className="text-xs font-mono font-medium text-[hsl(var(--foreground))]">
                  {shortAddr(account)}
                </span>
              </div>
              <button
                onClick={onDisconnect}
                className="px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-red-50 rounded-full border border-[hsl(var(--border))] transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              disabled={connecting}
              className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] text-white text-sm font-medium rounded-full hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2"/>
                <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {connecting ? 'Connecting…' : 'Connect MetaMask'}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
