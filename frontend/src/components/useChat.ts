import { useEffect, useRef, useState } from 'react'
import { useSendChat } from '../api/generated/endpoints'
import type { VerifyCodeResponse } from '../api/generated/model'

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Owns the whole chat conversation: message history, the send mutation, the
// on-demand code modal, and the scripted human-escalation theater (Epic G).
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [showModal, setShowModal] = useState(false)
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null)
  const [escalated, setEscalated] = useState(false)
  const [typing, setTyping] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

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
          setCodeExpiresAt(d.code_expires_at ?? null)
          setShowModal(true)
        }
      },
    },
  })

  function sendMessage(text: string) {
    if (mutation.isPending) return
    addMessage({ role: 'user', content: text })
    mutation.mutate({ data: { message: text, session_id: sessionId } })
  }

  function resolveVerification(result: VerifyCodeResponse) {
    setShowModal(false)
    setCodeExpiresAt(null)
    addMessage({ role: 'assistant', content: result.reply })
  }

  // The code expired: close the modal and prompt a restart. The backend drops an
  // expired code_sent session back to collecting_identity, so the user's next
  // name + phone message issues a fresh code.
  function startOverVerification() {
    setShowModal(false)
    setCodeExpiresAt(null)
    addMessage({
      role: 'assistant',
      content:
        'Your verification code has expired. Please share your name and phone number again to get a new one.',
    })
  }

  return {
    messages,
    escalated,
    typing,
    showModal,
    codeExpiresAt,
    sessionId,
    isPending: mutation.isPending,
    isError: mutation.isError,
    sendMessage,
    resolveVerification,
    startOverVerification,
  }
}
