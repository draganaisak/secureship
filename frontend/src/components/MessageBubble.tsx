import type { Message } from './useChat'

const bubbleBase =
  'max-w-[80%] px-4 py-2.5 rounded-2xl leading-relaxed whitespace-pre-wrap break-words shadow-sm'

export function MessageBubble({ message, escalated }: { message: Message; escalated: boolean }) {
  if (message.role === 'system') {
    return (
      <p role="status" className="self-center text-sm text-slate-400">
        {message.content}
      </p>
    )
  }

  const isUser = message.role === 'user'
  return (
    <p
      className={
        isUser
          ? `${bubbleBase} self-end text-white rounded-br-md ${escalated ? 'bg-emerald-600' : 'bg-violet-600'}`
          : `${bubbleBase} self-start bg-slate-100 text-slate-800 rounded-bl-md`
      }
    >
      <span className="sr-only">{isUser ? 'You: ' : 'SecureShip: '}</span>
      {message.content}
    </p>
  )
}

export function TypingIndicator({ escalated }: { escalated: boolean }) {
  return (
    <p role="status" className={`${bubbleBase} self-start bg-slate-100 text-slate-400`}>
      <span className="sr-only">{escalated ? 'Natalie is typing' : 'SecureShip is typing'}</span>
      <span aria-hidden="true">...</span>
    </p>
  )
}

export function ErrorBubble() {
  return (
    <p role="alert" className={`${bubbleBase} self-center bg-rose-50 text-rose-700 shadow-none`}>
      Something went wrong. Try again.
    </p>
  )
}
