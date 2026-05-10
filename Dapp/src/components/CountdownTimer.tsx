import { useEffect, useState } from 'react'

type Props = {
  deadline: bigint        // Unix timestamp (seconds)
  label: string           // e.g. "Voting ends in"
  onExpired?: () => void  // callback when countdown reaches 0
  urgent?: number         // seconds threshold để đổi màu đỏ (default 3600 = 1h)
}

function pad(n: number) { return String(n).padStart(2, '0') }

export function CountdownTimer({ deadline, label, onExpired, urgent = 3600 }: Props) {
  const [remaining, setRemaining] = useState<number>(0)
  const [fired, setFired] = useState(false)

  useEffect(() => {
    const calc = () => {
      const diff = Number(deadline) - Math.floor(Date.now() / 1000)
      return Math.max(0, diff)
    }

    setRemaining(calc())

    const id = setInterval(() => {
      const r = calc()
      setRemaining(r)
      if (r === 0 && !fired) {
        setFired(true)
        onExpired?.()
        clearInterval(id)
      }
    }, 1000)

    return () => clearInterval(id)
  }, [deadline, fired, onExpired])

  if (remaining === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
        {label.replace('ends in', 'has ended')}
      </div>
    )
  }

  const days    = Math.floor(remaining / 86400)
  const hours   = Math.floor((remaining % 86400) / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)
  const seconds = remaining % 60
  const isUrgent = remaining <= urgent

  return (
    <div className={`flex items-center gap-2 text-xs font-medium ${isUrgent ? 'text-red-600' : 'text-blue-600'}`}>
      {/* Pulse dot */}
      <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${isUrgent ? 'bg-red-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`} />

      <span>{label}</span>

      {/* Timer segments */}
      <div className={`flex items-center gap-0.5 font-mono tabular-nums px-2 py-0.5 rounded-lg ${isUrgent ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
        {days > 0 && (
          <>
            <span>{days}d</span>
            <span className="opacity-40 mx-0.5">:</span>
          </>
        )}
        <span>{pad(hours)}</span>
        <span className="opacity-40 animate-pulse">:</span>
        <span>{pad(minutes)}</span>
        <span className="opacity-40 animate-pulse">:</span>
        <span>{pad(seconds)}</span>
      </div>
    </div>
  )
}
