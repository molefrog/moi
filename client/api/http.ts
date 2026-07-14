async function errorFrom(response: Response, fallback: string) {
  const detail = await response.text()
  return new Error(detail || fallback)
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  error = 'Request failed'
) {
  const response = await fetch(input, init)
  if (!response.ok) throw await errorFrom(response, error)
  return response.json() as Promise<T>
}

export async function requestVoid(
  input: RequestInfo | URL,
  init?: RequestInit,
  error = 'Request failed'
) {
  const response = await fetch(input, init)
  if (!response.ok) throw await errorFrom(response, error)
}

export function jsonRequest(method: 'POST' | 'PUT', body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }
}
