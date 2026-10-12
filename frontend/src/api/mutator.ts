const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// A non-React module can't read the Auth0 token directly; AuthTokenBridge
// registers a getter here at runtime for admin requests.
type TokenGetter = () => Promise<string | null>
let accessTokenGetter: TokenGetter | null = null

export const setAccessTokenGetter = (getter: TokenGetter | null): void => {
  accessTokenGetter = getter
}

// Orval's fetch client expects the mutator to resolve to { data, status, headers }.
export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  const headers = new Headers(options.headers)
  if (url.startsWith('/admin') && accessTokenGetter) {
    const token = await accessTokenGetter()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  const res = await fetch(`${API_URL}${url}`, { ...options, headers })
  if (!res.ok) {
    const error = new Error(`Request failed: ${res.status}`) as Error & { status?: number }
    error.status = res.status
    throw error
  }

  const data = res.status === 204 ? undefined : await res.json()
  return { data, status: res.status, headers: res.headers } as T
}

export default customFetch
