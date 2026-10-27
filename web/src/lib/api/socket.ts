import { MOCK } from './client'

export type SocketState = 'connecting' | 'open' | 'closed' | 'error'

/** The minimum a socket implementation must provide; the mock layer implements the same. */
export interface SocketLike {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((data: string) => void) | null
  onclose: ((code: number, reason: string) => void) | null
  onerror: (() => void) | null
}

/**
 * A typed JSON WebSocket. `Out` is what the browser sends, `In` what the server pushes.
 * Messages sent before the socket opens are queued and flushed on open.
 */
export class TacitSocket<In, Out> {
  state: SocketState = 'connecting'
  private impl: SocketLike | null = null
  private queue: string[] = []
  private closedByUser = false
  private listeners = {
    message: new Set<(msg: In) => void>(),
    state: new Set<(s: SocketState, reason?: string) => void>(),
  }

  constructor(readonly path: string) {
    void this.connect()
  }

  private async connect() {
    let impl: SocketLike
    if (MOCK) {
      const { openMockSocket } = await import('../mock/sockets')
      impl = openMockSocket(this.path)
    } else {
      impl = realSocket(this.path)
    }
    if (this.closedByUser) {
      impl.close()
      return
    }
    this.impl = impl
    impl.onopen = () => {
      this.setState('open')
      for (const m of this.queue) impl.send(m)
      this.queue = []
    }
    impl.onmessage = (data) => {
      let msg: In
      try {
        msg = JSON.parse(data) as In
      } catch {
        return
      }
      for (const fn of this.listeners.message) fn(msg)
    }
    impl.onerror = () => this.setState('error')
    impl.onclose = (_code, reason) => {
      if (this.state !== 'error') this.setState('closed', reason)
    }
  }

  private setState(s: SocketState, reason?: string) {
    this.state = s
    for (const fn of this.listeners.state) fn(s, reason)
  }

  onMessage(fn: (msg: In) => void) {
    this.listeners.message.add(fn)
    return () => void this.listeners.message.delete(fn)
  }

  onState(fn: (s: SocketState, reason?: string) => void) {
    this.listeners.state.add(fn)
    return () => void this.listeners.state.delete(fn)
  }

  send(msg: Out) {
    const data = JSON.stringify(msg)
    if (this.impl && this.state === 'open') this.impl.send(data)
    else if (this.state === 'connecting') this.queue.push(data)
  }

  get bufferedAmount() {
    return this.impl && 'bufferedAmount' in this.impl ? Number(this.impl.bufferedAmount) : 0
  }

  close() {
    this.closedByUser = true
    this.impl?.close()
    this.listeners.message.clear()
  }
}

function realSocket(path: string): SocketLike {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${proto}//${location.host}${path}`)
  const like: SocketLike & { readonly bufferedAmount: number } = {
    send: (d) => ws.send(d),
    close: () => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', () => ws.close())
      } else {
        ws.close()
      }
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    get bufferedAmount() {
      return ws.bufferedAmount
    },
  }
  ws.onopen = () => like.onopen?.()
  ws.onmessage = (e) => like.onmessage?.(typeof e.data === 'string' ? e.data : '')
  ws.onclose = (e) => like.onclose?.(e.code, e.reason)
  ws.onerror = () => like.onerror?.()
  return like
}
