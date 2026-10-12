import { useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { setAccessTokenGetter } from '../api/mutator'

// Feeds the Auth0 access-token getter into the API mutator for admin requests.
export default function AuthTokenBridge() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  useEffect(() => {
    setAccessTokenGetter(async () => {
      if (!isAuthenticated) return null
      try {
        return (await getAccessTokenSilently()) ?? null
      } catch {
        return null
      }
    })
    return () => setAccessTokenGetter(null)
  }, [getAccessTokenSilently, isAuthenticated])

  return null
}
