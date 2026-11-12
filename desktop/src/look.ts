// What UI edit mode lets you repaint without writing CSS: a few theme variables and the body text size.
// Stored as one pref; anything unknown or malformed in storage is dropped, never applied.
export const LOOK_VARS = ['--sel', '--hi', '--text', '--panel'] as const
export type Look = { vars: Partial<Record<(typeof LOOK_VARS)[number], string>>; size?: number }
export const NO_LOOK: Look = { vars: {} }

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export const parseLook = (raw: string | null): Look => {
  try {
    const v = JSON.parse(raw ?? '')
    const vars = Object.fromEntries(LOOK_VARS.filter(k => isColor(v?.vars?.[k])).map(k => [k, v.vars[k]]))
    const size = Number.isInteger(v?.size) && v.size >= 11 && v.size <= 18 ? v.size : undefined
    return size ? { vars, size } : { vars }
  } catch { return NO_LOOK }
}
