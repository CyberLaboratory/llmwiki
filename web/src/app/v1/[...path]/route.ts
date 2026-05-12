import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Server-side env var — read at runtime from the container environment (K8s ConfigMap).
// Use the internal K8s service DNS, e.g. http://llmwiki-api:8000
const API_BASE = (process.env.API_URL || 'http://localhost:8000').replace(/\/$/, '')

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'host',
])

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const target = `${API_BASE}/v1/${path.join('/')}${req.nextUrl.search}`

  const headers = new Headers()
  req.headers.forEach((val, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, val)
  })

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error duplex required for streaming request body
    duplex: 'half',
    // Follow redirects server-side so FastAPI's trailing-slash redirects
    // never escape to the browser as a raw Location: <api-url> header.
    redirect: 'follow',
  })

  const resHeaders = new Headers()
  upstream.headers.forEach((val, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) resHeaders.set(key, val)
  })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const HEAD = handle
export const OPTIONS = handle
