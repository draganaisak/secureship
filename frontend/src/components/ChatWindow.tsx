import { useChat } from './useChat'
import { MessageBubble, TypingIndicator, ErrorBubble } from './MessageBubble'
import ChatComposer from './ChatComposer'
import CodeModal from './CodeModal'

export default function ChatWindow() {
  const chat = useChat()

  return (
    <section
      aria-label="SecureShip support chat"
      className="relative flex flex-col w-full max-w-2xl h-[100dvh] overflow-hidden bg-white sm:h-[90vh] sm:rounded-2xl sm:shadow-xl sm:ring-1 sm:ring-slate-200"
    >
      <header className={`px-5 py-4 text-white ${chat.escalated ? 'bg-emerald-600' : 'bg-violet-600'}`}>
        <h1 className="font-semibold">
          {chat.escalated ? 'SecureShip - Live agent' : 'SecureShip'}
        </h1>
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto p-5 flex flex-col gap-3"
      >
        {chat.messages.map((m, i) => (
          <MessageBubble key={i} message={m} escalated={chat.escalated} />
        ))}
        {(chat.isPending || chat.typing) && <TypingIndicator escalated={chat.escalated} />}
        {chat.isError && <ErrorBubble />}
      </div>

      <ChatComposer
        disabled={chat.isPending}
        modalOpen={chat.showModal}
        escalated={chat.escalated}
        onSend={chat.sendMessage}
      />

      {chat.showModal && chat.sessionId && (
        <CodeModal
          sessionId={chat.sessionId}
          expiresAt={chat.codeExpiresAt}
          onResolved={chat.resolveVerification}
          onStartOver={chat.startOverVerification}
        />
      )}
    </section>
  )
}
