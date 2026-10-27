import type { ApiErrorBody } from './types'

/**
 * Mock mode is a build-time switch (`VITE_TACIT_MOCK=1`). Vite replaces the constant, so in a
 * normal build every `if (MOCK)` branch, and the dynamic import of the mock layer behind it, is
 * removed: the shipped app only ever talks to the real backend.
 */
export const MOCK = import.meta.env.VITE_TACIT_MOCK === '1'

let currentUser = 'u_maria'

export function setApiUser(id: string) {
  currentUser = id
}

export function getApiUser() {
  return currentUser
}

export class ApiError extends Error {
  status: number
  code: string
  detail: Record<string, unknown>

  constructor(status: number, code: string, message: string, detail: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  form?: FormData
  signal?: AbortSignal
  headers?: Record<string, string>
}

/** Low-level fetch: same signature for the real network and the in-app mock. */
export async function rawFetch(path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { 'X-Tacit-User': currentUser, ...opts.headers }
  let body: BodyInit | undefined
  if (opts.form) {
    body = opts.form
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const init: RequestInit = { method: opts.method ?? 'GET', headers, body, signal: opts.signal }
  if (MOCK) {
    const { mockFetch } = await import('../mock/server')
    return mockFetch(path, init)
  }
  return fetch(path, init)
}

async function toError(res: Response): Promise<ApiError> {
  let parsed: ApiErrorBody | null = null
  try {
    parsed = (await res.json()) as ApiErrorBody
  } catch {
    parsed = null
  }
  if (parsed?.error) {
    return new ApiError(res.status, parsed.error.code, parsed.error.message, parsed.error.detail)
  }
  const code = res.status === 404 ? 'not_found' : res.status >= 500 ? 'internal' : 'bad_request'
  return new ApiError(res.status, code, `${res.status} ${res.statusText || 'request failed'}`)
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await rawFetch(path, opts)
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'network', 'The Tacit box did not answer. Is the backend running on :8710?')
  }
  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

export async function requestBinary(path: string, signal?: AbortSignal) {
  const res = await rawFetch(path, { signal })
  if (!res.ok) throw await toError(res)
  return { buffer: await res.arrayBuffer(), headers: res.headers }
}

export interface SseEvent {
  event: string
  data: string
}

/** POST that answers with `text/event-stream`; yields each event as it arrives. */
export async function* streamEvents(path: string, opts: RequestOptions): AsyncGenerator<SseEvent> {
  const res = await rawFetch(path, { ...opts, method: 'POST', headers: { Accept: 'text/event-stream' } })
  if (!res.ok) throw await toError(res)
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '')
      let event = 'message'
      const data: string[] = []
      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      yield { event, data: data.join('\n') }
    }
  }
}

/** Absolute media URLs from the API are same-origin paths; leave them as they are. */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return path
}
