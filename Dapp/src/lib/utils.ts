import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shortAddr(addr?: string | null): string {
  if (!addr) return '—'
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

export function fmtTimestamp(ts: number | bigint | string): string {
  const n = Number(ts)
  if (!n) return '—'
  return new Date(n * 1000).toLocaleString()
}
