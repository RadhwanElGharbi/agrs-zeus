import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
// NOTE: force-dynamic is only valid in non-export mode (dev server).
// For `next build` with output:'export', this file is skipped because
// the careers API is served by the website backend, not by the ZEUS desktop app.
export const dynamic = 'force-static'

const APPLICATIONS_DIR = '/opt/agrs/applications'

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // Ensure directory exists (redundant safety)
  await fs.mkdir(APPLICATIONS_DIR, { recursive: true })

  // Determine Serial Number
  // We'll count the number of existing files to determine the next serial
  let serial = 1
  try {
    const files = await fs.readdir(APPLICATIONS_DIR)
    // Filter for JSON files to count correctly
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    serial = jsonFiles.length + 1
  } catch (e) {
    // If directory read fails, start at 1
  }

  const serialStr = String(serial).padStart(4, '0')
  const fileName = `${serialStr}.json`
  const filePath = path.join(APPLICATIONS_DIR, fileName)

  const applicationData = {
    serial: serialStr,
    timestamp: new Date().toISOString(),
    ...body
  }

  try {
    await fs.writeFile(filePath, JSON.stringify(applicationData, null, 2), 'utf8')
    return NextResponse.json({ ok: true, serial: serialStr })
  } catch (e) {
    console.error('Failed to save application:', e)
    return NextResponse.json({ ok: false, error: 'Failed to save application' }, { status: 500 })
  }
}

















