import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSendChat } from '../api/generated/endpoints'
import type { VerifyCodeResponse } from '../api/generated/model'
import CodeModal from './CodeModal'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const bubbleBase =
  'max-w-[80%] px-4 py-2.5 rounded-2xl leading-relaxed whitespace-pre-wrap break-words shadow-sm'

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [typing, setTyping] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const addMessage = (m: Message) => setMessages((prev) => [...prev, m])

  function playEscalation(firstName: string | null) {
    setEscalated(true)
    const name = firstName ? ` ${firstName}` : ''
    const at = (delay: number, fn: () => void) =>
      timers.current.push(setTimeout(fn, delay))

    let t = 600
    at(t, () => addMessage({ role: 'system', content: 'Natalie has entered the chat' }))

    const lines = [
      'Hello, my name is Natalie. Let me read through your conversation...',
      `Hi${name}! I'm all caught up now. How can I help?`,
    ]
    for (const content of lines) {
      t += 500
      at(t, () => setTyping(true))
      t += 1500
      at(t, () => {
        setTyping(false)
        addMessage({ role: 'assistant', content })
      })
    }
  }

  const mutation = useSendChat({
    mutation: {
      onSuccess: (response) => {
        if (response.status !== 200) return
        const d = response.data
        setSessionId(d.session_id)
        addMessage({ role: 'assistant', content: d.reply })
        if (d.escalate) {
          playEscalation(d.first_name ?? null)
        } else if (d.show_code_modal) {
          setShowModal(true)
        }
      },
    },
  })

  // Refocus the composer once a reply settles, but never while the modal is open.
  useEffect(() => {
    if (!mutation.isPending && !showModal) inputRef.current?.focus()
  }, [mutation.isPending, showModal])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || mutation.isPending) return
    addMessage({ role: 'user', content: text })
    setInput('')
    mutation.mutate({ data: { message: text, session_id: sessionId } })
  }

  function handleVerifyResolved(result: VerifyCodeResponse) {
    setShowModal(false)
    addMessage({ role: 'assistant', content: result.reply })
  }

  return (
    <section
      aria-label="SecureShip support chat"
      className="relative flex flex-col w-full max-w-2xl h-[100dvh] overflow-hidden bg-white sm:h-[90vh] sm:rounded-2xl sm:shadow-xl sm:ring-1 sm:ring-slate-200"
    >
      <header
        className={`px-5 py-4 text-white ${escalated ? 'bg-emerald-600' : 'bg-violet-600'}`}
      >
        <h1 className="font-semibold">
          {escalated ? 'SecureShip - Live agent' : 'SecureShip'}
        </h1>
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto p-5 flex flex-col gap-3"
      >
        {messages.map((m, i) =>
          m.role === 'system' ? (
            <p key={i} role="status" className="self-center text-sm text-slate-400">
              {m.content}
            </p>
          ) : (
            <p
              key={i}
              className={
                m.role === 'user'
                  ? `${bubbleBase} self-end text-white rounded-br-md ${escalated ? 'bg-emerald-600' : 'bg-violet-600'}`
                  : `${bubbleBase} self-start bg-slate-100 text-slate-800 rounded-bl-md`
              }
            >
              <span className="sr-only">{m.role === 'user' ? 'You: ' : 'SecureShip: '}</span>
              {m.content}
            </p>
          ),
        )}
        {(mutation.isPending || typing) && (
          <p role="status" className={`${bubbleBase} self-start bg-slate-100 text-slate-400`}>
            <span className="sr-only">
              {escalated ? 'Natalie is typing' : 'SecureShip is typing'}
            </span>
            <span aria-hidden="true">...</span>
          </p>
        )}
        {mutation.isError && (
          <p
            role="alert"
            className={`${bubbleBase} self-center bg-rose-50 text-rose-700 shadow-none`}
          >
            Something went wrong. Try again.
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 p-3 border-t border-slate-200 bg-white"
      >
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
          disabled={mutation.isPending}
          className={`px-5 py-2.5 rounded-xl text-white font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default transition ${escalated ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800' : 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800'}`}
        >
          Send
        </button>
      </form>

      {showModal && sessionId && (
        <CodeModal sessionId={sessionId} onResolved={handleVerifyResolved} />
      )}
    </section>
  )
}
