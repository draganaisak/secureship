import { useRef, useState, type FormEvent } from 'react'
import { useSendChat } from '../api/generated/endpoints'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const bubbleBase =
  'max-w-[80%] px-4 py-2.5 rounded-2xl leading-relaxed whitespace-pre-wrap break-words shadow-sm'

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const sessionId = useRef<string | null>(null)

  const mutation = useSendChat({
    mutation: {
      onSuccess: (response) => {
        if (response.status !== 200) return
        sessionId.current = response.data.session_id
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: response.data.reply },
        ])
      },
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || mutation.isPending) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    mutation.mutate({ data: { message: text, session_id: sessionId.current } })
  }

  return (
    <section
      aria-label="SecureShip support chat"
      className="flex flex-col w-full max-w-2xl h-[90vh] bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 overflow-hidden"
    >
      <header className="px-5 py-4 bg-violet-600 text-white">
        <h1 className="font-semibold">SecureShip</h1>
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto p-5 flex flex-col gap-3"
      >
        {messages.map((m, i) => (
          <p
            key={i}
            className={
              m.role === 'user'
                ? `${bubbleBase} self-end bg-violet-600 text-white rounded-br-md`
                : `${bubbleBase} self-start bg-slate-100 text-slate-800 rounded-bl-md`
            }
          >
            <span className="sr-only">
              {m.role === 'user' ? 'You: ' : 'SecureShip: '}
            </span>
            {m.content}
          </p>
        ))}
        {mutation.isPending && (
          <p
            role="status"
            className={`${bubbleBase} self-start bg-slate-100 text-slate-400`}
          >
            <span className="sr-only">SecureShip is typing</span>
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
          placeholder="Ask about a shipment..."
          disabled={mutation.isPending}
          className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-semibold cursor-pointer hover:bg-violet-700 active:bg-violet-800 disabled:opacity-50 disabled:cursor-default transition"
        >
          Send
        </button>
      </form>
    </section>
  )
}
