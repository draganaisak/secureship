import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useVerifyCode } from '../api/generated/endpoints'
import type { VerifyCodeResponse } from '../api/generated/model'

interface CodeModalProps {
  sessionId: string
  expiresAt?: string | null
  onResolved: (result: VerifyCodeResponse) => void
  onStartOver: () => void
}

function formatRemaining(seconds: number): string {
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export default function CodeModal({
  sessionId,
  expiresAt,
  onResolved,
  onStartOver,
}: CodeModalProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Tick a clock once a second; `remaining` is derived from it below so the
  // countdown stays honest across re-renders, a reload, or a wrong-code retry
  // (the server's absolute expiry does not change).
  useEffect(() => {
    if (!expiresAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const remaining = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
    : null
  const expired = remaining !== null && remaining <= 0

  const mutation = useVerifyCode({
    mutation: {
      onSuccess: (response) => {
        if (response.status !== 200) return
        const result = response.data

        if (result.verified || result.state === 'collecting_identity') {
          onResolved(result)
        } else {
          setError(result.reply)
          setCode('')
          inputRef.current?.focus()
        }
      },
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending || code.length !== 6) return
    setError(null)
    mutation.mutate({ data: { session_id: sessionId, code } })
  }

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-modal-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="code-modal-title" className="text-lg font-semibold text-slate-800">
          Enter your verification code
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          We've sent a 6-digit code by SMS to the phone number on your account.
          Enter it below to continue.
        </p>

        {remaining !== null &&
          (expired ? (
            <p className="mt-2 text-sm font-medium text-rose-600">
              This code has expired. Start over to get a new one.
            </p>
          ) : (
            <p
              className={`mt-2 text-sm ${remaining <= 60 ? 'text-amber-600' : 'text-slate-500'}`}
              aria-live="polite"
            >
              Expires in <span className="font-medium tabular-nums">{formatRemaining(remaining)}</span>
            </p>
          ))}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label htmlFor="code-input" className="sr-only">
            6-digit verification code
          </label>
          <input
            id="code-input"
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={expired}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-center text-2xl tracking-[0.4em] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400"
          />

          {error && !expired && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}

          {expired ? (
            <button
              type="button"
              onClick={onStartOver}
              className="rounded-xl bg-violet-600 px-5 py-2.5 font-semibold text-white transition hover:bg-violet-700 active:bg-violet-800"
            >
              Start over
            </button>
          ) : (
            <button
              type="submit"
              disabled={mutation.isPending || code.length !== 6}
              className="rounded-xl bg-violet-600 px-5 py-2.5 font-semibold text-white transition hover:bg-violet-700 active:bg-violet-800 disabled:opacity-50"
            >
              {mutation.isPending ? 'Verifying...' : 'Verify'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
