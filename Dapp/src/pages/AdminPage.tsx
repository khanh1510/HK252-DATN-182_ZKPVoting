import { useState } from 'react'
import { CreatePollPanel }   from './admin/CreatePollPanel'
import { ApproveVoterPanel } from './admin/ApproveVoterPanel'
import { ManagePollsPanel }  from './admin/ManagePollsPanel'

const TABS = [
  {
    key: 'create',
    label: 'Create Poll',
    desc: 'Deploy a new voting pool',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key: 'approve',
    label: 'Approve Voter',
    desc: 'Sign EIP-712 coupon for Company mode',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'manage',
    label: 'Manage Polls',
    desc: 'Advance phases for your polls',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
    ),
  },
]

export default function AdminPage() {
  const [tab, setTab] = useState('create')
  const active = TABS.find(t => t.key === tab)!

  return (
    <div className="flex gap-6 items-start">

      {/* ── LEFT: sub-navigation ─────────────────────────────────── */}
      <div className="w-56 shrink-0 space-y-1 sticky top-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3 mb-3">
          Admin Panel
        </p>
        {TABS.map(({ key, label, desc, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
              tab === key
                ? 'bg-[hsl(var(--accent))] text-[hsl(var(--primary))]'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            }`}>
            <span className={tab === key ? 'text-[hsl(var(--primary))]' : 'text-gray-400'}>
              {icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{label}</p>
              <p className="text-[10px] text-gray-400 truncate mt-0.5">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ── RIGHT: content ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {/* Page header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[hsl(var(--primary))]">{active.icon}</span>
            <h1 className="text-xl font-bold text-gray-900">{active.label}</h1>
          </div>
          <p className="text-sm text-gray-400">{active.desc}</p>
        </div>

        {/* Panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {tab === 'create'  && <CreatePollPanel />}
          {tab === 'approve' && <ApproveVoterPanel />}
          {tab === 'manage'  && <ManagePollsPanel />}
        </div>
      </div>

    </div>
  )
}
