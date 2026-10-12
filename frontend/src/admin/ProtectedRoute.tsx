import { useEffect, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

// Client-side gate: redirects to Auth0 Universal Login when not authenticated.
// This is UX only - the real enforcement is the backend require_admin dependency
// on every /admin route (Epic E3).
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, error, loginWithRedirect } = useAuth0()

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      loginWithRedirect()
    }
  }, [isLoading, isAuthenticated, error, loginWithRedirect])

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 text-slate-400">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 p-4">
        <p role="alert" className="text-rose-700">Sign-in failed: {error.message}</p>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return <>{children}</>
}
