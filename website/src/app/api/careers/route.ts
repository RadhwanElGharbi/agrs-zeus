import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APPLICATIONS_DIR = '/opt/agrs/applications'

export async function POST(req: Request) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  await fs.mkdir(APPLICATIONS_DIR, { recursive: true })
  let serial = 1
  try {
    const files = await fs.readdir(APPLICATIONS_DIR)
    serial = files.filter(f => f.endsWith('.json')).length + 1
  } catch {}
  const serialStr = String(serial).padStart(4, '0')
  const filePath = path.join(APPLICATIONS_DIR, `${serialStr}.json`)
  const applicationData = { serial: serialStr, timestamp: new Date().toISOString(), ...body }
  try {
    await fs.writeFile(filePath, JSON.stringify(applicationData, null, 2), 'utf8')
    return NextResponse.json({ ok: true, serial: serialStr })
  } catch (e) {
    console.error('Failed to save application:', e)
    return NextResponse.json({ ok: false, error: 'Failed to save application' }, { status: 500 })
  }
}
