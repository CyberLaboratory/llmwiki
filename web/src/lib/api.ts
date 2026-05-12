const isLocal = process.env.NEXT_PUBLIC_MODE === 'local'

// In local mode use relative paths — the Next.js server proxies /v1/* to the
// API via process.env.API_URL (set from the K8s ConfigMap at runtime).
// In hosted mode call the external API URL directly from the browser.
const API_URL = isLocal ? '' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')

export async function apiFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers as Record<string, string>,
  }

  if (!isLocal && token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `API error: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export function getDocumentsWsUrl(kbId: string): string {
  if (isLocal && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.host}/v1/ws/documents/${kbId}`
  }
  const wsBase = API_URL.replace(/^http/, 'ws')
  return `${wsBase}/v1/ws/documents/${kbId}`
}
