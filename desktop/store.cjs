// The window's settings, kept in files the main process owns instead of the page's localStorage,
// so they survive a change of the address the page loads from. Values are the same strings localStorage held.
const fs = require('node:fs/promises')
const path = require('node:path')

// Which file each key lives in: settings, layout and theme are kept apart so one never overwrites another.
const KEYS = { lang: 'settings', agents: 'settings', terminal: 'settings', motion: 'settings', layout: 'layout', split: 'layout', layoutPresets: 'layout', theme: 'theme' }
const FILES = [...new Set(Object.values(KEYS))]
const MAX = 1e6

const createStore = dir => {
  const values = {}
  const queue = {} // file -> the last write's promise, so writes to one file land in call order
  const fileOf = name => path.join(dir, `${name}.json`)

  const load = async () => {
    for (const name of FILES) {
      let saved
      try { saved = JSON.parse(await fs.readFile(fileOf(name), 'utf8'))?.values } catch { continue } // missing or broken: that file starts empty
      if (!saved || typeof saved !== 'object') continue
      for (const [key, value] of Object.entries(saved)) if (KEYS[key] === name && typeof value === 'string') values[key] = value
    }
  }

  const write = async name => {
    await fs.mkdir(dir, { recursive: true })
    const own = Object.fromEntries(Object.entries(values).filter(([key]) => KEYS[key] === name))
    const tmp = `${fileOf(name)}.tmp`
    await fs.writeFile(tmp, JSON.stringify({ version: 1, values: own }), { mode: 0o600 })
    await fs.rename(tmp, fileOf(name)) // a crash mid-write leaves the old file whole
  }

  const set = async (key, value) => {
    if (!Object.hasOwn(KEYS, key)) throw new Error(`Unknown setting: ${key}`)
    if (typeof value !== 'string' || value.length > MAX) throw new Error(`Bad value for ${key}`)
    values[key] = value
    const name = KEYS[key]
    queue[name] = (queue[name] ?? Promise.resolve()).catch(() => {}).then(() => write(name))
    return queue[name]
  }

  return { load, set, snapshot: () => ({ keys: Object.keys(KEYS), values: { ...values } }) }
}

module.exports = { createStore, KEYS }
