import { useEffect, useRef, useState, type FormEvent } from 'react'

interface ChatComposerProps {
  disabled: boolean
  modalOpen: boolean
  escalated: boolean
  onSend: (text: string) => void
}

export default function ChatComposer({ disabled, modalOpen, escalated, onSend }: ChatComposerProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Refocus the composer once a reply settles, but never while the modal is open.
  useEffect(() => {
    if (!disabled && !modalOpen) inputRef.current?.focus()
  }, [disabled, modalOpen])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || disabled) return
    onSend(text)
    setInput('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-slate-200 bg-white">
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <input
        id="chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        ref={inputRef}
        placeholder="Ask about a shipment..."
        className={`flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm outline-none transition focus:ring-2 ${escalated ? 'focus:border-emerald-500 focus:ring-emerald-100' : 'focus:border-violet-500 focus:ring-violet-100'}`}
      />
      <button
        type="submit"
        disabled={disabled}
        className={`px-5 py-2.5 rounded-xl text-white font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default transition ${escalated ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800' : 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800'}`}
      >
        Send
      </button>
    </form>
  )
}
