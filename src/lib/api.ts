import type { ApiEnvelope, ApiErrorBody } from '../types'

const CONFIGURED_API_ROOT = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '')
const API_ROOT = CONFIGURED_API_ROOT || '/api/v1'
const HEALTH_ROOT = API_ROOT.endsWith('/api/v1') ? API_ROOT.slice(0, -7) : ''
const TOKEN_KEY = 'qingzhi.session.token.v1'

export class ApiError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = body?.code
    this.details = body?.details
  }
}

function token() {
  return window.localStorage.getItem(TOKEN_KEY)
}

async function requestEnvelope<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers)
  const storedToken = token()
  if (storedToken) headers.set('Authorization', `Bearer ${storedToken}`)
  if (!(init.body instanceof FormData) && init.body !== undefined) headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')

  let response: Response
  try {
    response = await fetch(`${API_ROOT}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('无法连接 QINGZHI API，请检查 VITE_API_BASE_URL 与服务状态。', 0, { code: 'NETWORK_ERROR' })
  }

  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const error = typeof body === 'object' && body && 'error' in body ? body.error as ApiErrorBody : undefined
    throw new ApiError(error?.message ?? `请求失败（HTTP ${response.status}）`, response.status, error)
  }
  if (body && typeof body === 'object' && 'data' in body) return body as ApiEnvelope<T>
  return { data: body as T }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await requestEnvelope<T>(path, init)).data
}

async function download(path: string): Promise<Blob> {
  const headers = new Headers()
  const storedToken = token()
  if (storedToken) headers.set('Authorization', `Bearer ${storedToken}`)
  const response = await fetch(`${API_ROOT}${path}`, { headers })
  if (!response.ok) throw new ApiError(`下载失败（HTTP ${response.status}）`, response.status)
  return response.blob()
}

export function createIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export const authStore = {
  getToken: token,
  setToken(value: string) { window.localStorage.setItem(TOKEN_KEY, value) },
  clear() { window.localStorage.removeItem(TOKEN_KEY) },
}

export const api = {
  get<T>(path: string) { return request<T>(path) },
  getWithMeta<T>(path: string) { return requestEnvelope<T>(path) },
  post<T>(path: string, data?: unknown, idempotent = false, explicitIdempotencyKey?: string) {
    const headers = idempotent
      ? { 'Idempotency-Key': explicitIdempotencyKey ?? createIdempotencyKey(path.replaceAll('/', '-')) }
      : undefined
    return request<T>(path, { method: 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data) })
  },
  patch<T>(path: string, data: unknown) {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(data) })
  },
  delete<T>(path: string) { return request<T>(path, { method: 'DELETE' }) },
  upload<T>(path: string, form: FormData) { return request<T>(path, { method: 'POST', body: form }) },
  download,
  login(email: string, password: string) {
    return request<{ access_token: string; token_type?: string; user?: Record<string, unknown> }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },
  eventUrl(jobId: string) { return `${API_ROOT}/jobs/${jobId}/events` },
  healthUrl() { return `${HEALTH_ROOT}/healthz` },
}

export function humanError(error: unknown) {
  return error instanceof Error ? error.message : '发生未知错误，请稍后重试。'
}
