import { app } from 'electron'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Settings } from '@shared/api'

const file = (): string => join(app.getPath('userData'), 'settings.json')

const defaults = (): Settings => ({
  syncClockOnWrite: true,
  logPackets: false,
  vendorOverDongle: false,
  backupDir: homedir()
})

let cache: Settings | null = null

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache
  try {
    cache = { ...defaults(), ...JSON.parse(await fs.readFile(file(), 'utf8')) }
  } catch {
    cache = defaults()
  }
  return cache as Settings
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch }
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(next, null, 2))
  cache = next
  return next
}
