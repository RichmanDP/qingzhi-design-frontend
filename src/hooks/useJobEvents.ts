import { useEffect, useRef } from 'react'
import { api, authStore } from '../lib/api'

export function useJobEvents(jobId: string | undefined, onEvent: () => void) {
  const callbackRef = useRef(onEvent)
  callbackRef.current = onEvent

  useEffect(() => {
    if (!jobId) return
    const targetJobId = jobId
    const controller = new AbortController()
    let lastEventId = window.sessionStorage.getItem(`qingzhi.sse.${targetJobId}`) ?? ''
    let reloadTimer: number | undefined

    async function connect() {
      try {
        const headers = new Headers({ Accept: 'text/event-stream' })
        const token = authStore.getToken()
        if (token) headers.set('Authorization', `Bearer ${token}`)
        if (lastEventId) headers.set('Last-Event-ID', lastEventId)
        const response = await fetch(api.eventUrl(targetJobId), { headers, signal: controller.signal })
        if (!response.ok || !response.body) return
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''
          for (const chunk of chunks) {
            const idLine = chunk.split('\n').find((line) => line.startsWith('id:'))
            if (idLine) {
              lastEventId = idLine.slice(3).trim()
              window.sessionStorage.setItem(`qingzhi.sse.${targetJobId}`, lastEventId)
            }
            if (chunk.includes('data:')) {
              window.clearTimeout(reloadTimer)
              reloadTimer = window.setTimeout(() => callbackRef.current(), 180)
            }
          }
        }
      } catch {
        // Polling in the page is the recovery path; an SSE disconnect is expected and retried by refresh.
      }
    }

    void connect()
    return () => { window.clearTimeout(reloadTimer); controller.abort() }
  }, [jobId])
}
