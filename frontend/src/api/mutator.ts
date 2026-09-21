const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// Orval's fetch client expects the mutator to resolve to { data, status, headers }.
export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  const res = await fetch(`${API_URL}${url}`, options)
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`)
  }
  const data = await res.json()
  return { data, status: res.status, headers: res.headers } as T
}

export default customFetch
