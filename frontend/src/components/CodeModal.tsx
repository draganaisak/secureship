import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useVerifyCode } from '../api/generated/endpoints'
import type { VerifyCodeResponse } from '../api/generated/model'

interface CodeModalProps {
  sessionId: string
  onResolved: (result: VerifyCodeResponse) => void
}

export default function CodeModal({ sessionId, onResolved }: CodeModalProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    if (code.length !== 6 || mutation.isPending) return
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
          We sent a 6-digit code. Enter it below to continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label htmlFor="code-input" className="sr-only">
            6-digit verification code
          </label>
          <input
            id="code-input"
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-center text-2xl tracking-[0.4em] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />

          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={code.length !== 6 || mutation.isPending}
            className="rounded-xl bg-violet-600 px-5 py-2.5 font-semibold text-white transition hover:bg-violet-700 active:bg-violet-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  )
}
