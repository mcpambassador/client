import { describe, it, expect, beforeAll } from 'vitest'
import https from 'node:https'

const BASE = 'https://localhost:8443'
const DEV_PSK = 'amb_pk_jriTOb3Ai8g8asRpr1IlZXM0oam_ynrbuhwqMnoSpzSlc0sH'
const HOST_TOOL = 'custom'

function makeRequest(method: string, path: string, headers?: Record<string, string>, body?: any) {
  return new Promise<{ statusCode: number; body: any }>((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined
    const opts: https.RequestOptions = {
      method,
      rejectUnauthorized: false,
      headers: {
        'content-type': 'application/json',
        ...(headers || {}),
        ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
      },
    }

    const req = https.request(`${BASE}${path}`, opts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(Buffer.from(c)))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed: any = text
        try {
          parsed = text ? JSON.parse(text) : undefined
        } catch (e) {
          // leave as text
        }
        resolve({ statusCode: res.statusCode || 0, body: parsed })
      })
    })

    req.on('error', (err) => reject(err))
    if (data) req.write(data)
    req.end()
  })
}

async function registerWithRetry(payload: any, attempts = 8, delay = 500) {
  for (let i = 0; i < attempts; i++) {
    const res = await makeRequest('POST', '/v1/sessions/register', undefined, payload)
    if (res.statusCode === 429) {
      // rate limited; wait and retry
      await new Promise((r) => setTimeout(r, delay))
      delay *= 2
      continue
    }
    return res
  }
  // final attempt
  return makeRequest('POST', '/v1/sessions/register', undefined, payload)
}

describe('M16 - Client transformation E2E', () => {
  let shared: any

  beforeAll(async () => {
    shared = await registerWithRetry({ preshared_key: DEV_PSK, friendly_name: 'e2e-shared', host_tool: HOST_TOOL })
  }, 15000)

  it('Registration with valid preshared key', async () => {
    expect(shared.statusCode).toBe(201)
    expect(shared.body).toBeDefined()
    expect(shared.body.session_id).toBeTruthy()
    expect(shared.body.session_token).toBeTruthy()
    expect(shared.body.expires_at).toBeTruthy()
    expect(shared.body.profile_id).toBeTruthy()
    expect(shared.body.connection_id).toBeTruthy()
  }, 15000)

  it('Registration with invalid key should return 401', async () => {
    const payload = { preshared_key: 'amb_pk_invalidkeyfortesting123456789012345678', friendly_name: 'e2e-invalid', host_tool: HOST_TOOL }
    // Single attempt — do NOT retry invalid keys (they increment the rate limiter's failure counter)
    const res = await makeRequest('POST', '/v1/sessions/register', undefined, payload)
    expect(res.statusCode).toBe(401)
  }, 15000)

  it('Authenticated tool listing with valid session token', async () => {
    const token = shared.body.session_token
    const res = await makeRequest('GET', '/v1/tools', { 'X-Session-Token': token })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body.tools)).toBe(true)
    expect(res.body.tools.length).toBeGreaterThan(0)
  }, 15000)

  it('Heartbeat works with session token', async () => {
    const token = shared.body.session_token
    const res = await makeRequest('POST', '/v1/sessions/heartbeat', { 'X-Session-Token': token }, {})
    expect(res.statusCode).toBe(200)
  }, 15000)

  it('Unauthenticated request to /v1/tools should be 401', async () => {
    const res = await makeRequest('GET', '/v1/tools')
    expect(res.statusCode).toBe(401)
  }, 15000)

  it('Disconnect connection and post-disconnect token still works for tools listing', async () => {
    const token = shared.body.session_token
    const connectionId = shared.body.connection_id

    const del = await makeRequest('DELETE', `/v1/sessions/connections/${connectionId}`, { 'X-Session-Token': token })
    expect(del.statusCode).toBe(200)

    // Post-disconnect: same token should still be able to list tools (session persists)
    const post = await makeRequest('GET', '/v1/tools', { 'X-Session-Token': token })
    expect(post.statusCode).toBe(200)
    expect(Array.isArray(post.body.tools)).toBe(true)
  }, 15000)
})
