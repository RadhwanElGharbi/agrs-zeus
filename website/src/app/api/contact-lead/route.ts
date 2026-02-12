import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ANALYTICS_DIR = '/opt/agrs/analytics'
const CSV_PATH = path.join(ANALYTICS_DIR, 'contact_leads.csv')
const IP_CACHE_PATH = path.join(ANALYTICS_DIR, 'ip_locations_cache.json')

type Geo = { country?: string; region?: string; city?: string; lat?: number; lon?: number; timezone?: string; isp?: string; org?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CSV_HEADERS = ['timestamp_utc','email','message','page','ip','ip_source','location','country','region','city','lat','lon','timezone','isp','org','user_agent','accept_language','referer','origin','host','x_forwarded_for','x_real_ip','x_forwarded_proto','client_timezone','client_language','client_platform','client_screen','client_viewport'] as const

type CsvRow = Record<(typeof CSV_HEADERS)[number], string>

function csvSafe(value: unknown): string {
  const raw = String(value ?? '')
  const formulaRisk = /^[=+\-@]/.test(raw)
  const v = formulaRisk ? `'${raw}` : raw
  const needsQuotes = /[",\n\r]/.test(v)
  const escaped = v.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.') || ip === '::1') return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true
  return false
}

function getClientIp(headers: Headers): { ip: string; source: string; xff?: string; xri?: string } {
  const xff = headers.get('x-forwarded-for') ?? ''
  const xri = headers.get('x-real-ip') ?? ''
  const cf = headers.get('cf-connecting-ip') ?? ''
  const pickFirst = (v: string) => v.split(',')[0]?.trim()
  const candidates = [{ ip: pickFirst(cf), source: 'cf-connecting-ip' }, { ip: pickFirst(xff), source: 'x-forwarded-for' }, { ip: pickFirst(xri), source: 'x-real-ip' }]
  const found = candidates.find((c) => c.ip && c.ip.length > 0)
  return { ip: found?.ip ?? 'unknown', source: found?.source ?? 'unknown', xff, xri }
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')) as T } catch { return fallback }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

async function geolocateIp(ip: string): Promise<Geo> {
  if (!ip || ip === 'unknown' || isPrivateIp(ip)) return {}
  const cache = await readJsonFile<Record<string, Geo>>(IP_CACHE_PATH, {})
  if (cache[ip]) return cache[ip] ?? {}
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,regionName,city,lat,lon,timezone,isp,org,query`
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) return {}
    const data = (await res.json()) as any
    if (data?.status !== 'success') return {}
    const geo: Geo = { country: data.country, region: data.regionName, city: data.city, lat: data.lat, lon: data.lon, timezone: data.timezone, isp: data.isp, org: data.org }
    cache[ip] = geo
    await writeJsonFile(IP_CACHE_PATH, cache)
    return geo
  } catch { return {} } finally { clearTimeout(timeout) }
}

async function ensureCsv(): Promise<void> {
  await fs.mkdir(ANALYTICS_DIR, { recursive: true })
  try { const stat = await fs.stat(CSV_PATH); if (stat.size > 0) return } catch {}
  await fs.writeFile(CSV_PATH, CSV_HEADERS.join(',') + '\n', 'utf8')
}

async function appendCsvRow(row: CsvRow): Promise<void> {
  await ensureCsv()
  await fs.appendFile(CSV_PATH, CSV_HEADERS.map((k) => csvSafe(row[k])).join(',') + '\n', 'utf8')
}

export async function POST(req: Request) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const email = String(body?.email ?? '').trim()
  const message = String(body?.message ?? '').trim()
  if (!EMAIL_RE.test(email) || email.length > 320) return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 })
  const headers = req.headers
  const { ip, source: ip_source, xff, xri } = getClientIp(headers)
  const geo = await geolocateIp(ip)
  const locationParts = [geo.city, geo.region, geo.country].filter(Boolean)
  const location = locationParts.length ? locationParts.join(', ') : isPrivateIp(ip) ? 'Local Network' : 'Unknown'
  const row: CsvRow = {
    timestamp_utc: new Date().toISOString(), email, message, page: String(body?.page ?? ''), ip, ip_source, location,
    country: geo.country ?? '', region: geo.region ?? '', city: geo.city ?? '', lat: geo.lat != null ? String(geo.lat) : '', lon: geo.lon != null ? String(geo.lon) : '',
    timezone: geo.timezone ?? '', isp: geo.isp ?? '', org: geo.org ?? '', user_agent: headers.get('user-agent') ?? '', accept_language: headers.get('accept-language') ?? '',
    referer: headers.get('referer') ?? '', origin: headers.get('origin') ?? '', host: headers.get('host') ?? '', x_forwarded_for: xff ?? '', x_real_ip: xri ?? '',
    x_forwarded_proto: headers.get('x-forwarded-proto') ?? '', client_timezone: String(body?.client_timezone ?? ''), client_language: String(body?.client_language ?? ''),
    client_platform: String(body?.client_platform ?? ''), client_screen: String(body?.client_screen ?? ''), client_viewport: String(body?.client_viewport ?? ''),
  }
  try { await appendCsvRow(row); return NextResponse.json({ ok: true }) } catch { return NextResponse.json({ ok: false, error: 'Failed to write CSV' }, { status: 500 }) }
}
