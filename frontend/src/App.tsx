import { Routes, Route } from 'react-router-dom'
import ChatWindow from './components/ChatWindow'
import AdminPanel from './admin/AdminPanel'
import ProtectedRoute from './admin/ProtectedRoute'

function ChatPage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-violet-50 via-white to-slate-100 p-0 sm:p-4">
      <ChatWindow />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ChatPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPanel />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
