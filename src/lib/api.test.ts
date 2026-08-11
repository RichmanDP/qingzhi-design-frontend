import { describe, expect, it, vi } from 'vitest'
import { api } from './api'

describe('API success envelope', () => {
  it('通过 getWithMeta 保留 meta，同时保持 get 的旧解包行为', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      data: [{ id: 'row-1' }],
      meta: { request_id: 'req-envelope-1', count: 1, cursor: 'next-page' },
    }), { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.getWithMeta<Array<{ id: string }>>('/with-meta')).resolves.toEqual({
      data: [{ id: 'row-1' }],
      meta: { request_id: 'req-envelope-1', count: 1, cursor: 'next-page' },
    })
    await expect(api.get<Array<{ id: string }>>('/legacy')).resolves.toEqual([{ id: 'row-1' }])
  })
})
