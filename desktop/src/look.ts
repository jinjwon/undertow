// What UI edit mode lets you repaint without writing CSS: a few theme variables and three sizes.
// Stored as one pref; anything unknown or malformed in storage is dropped, never applied.
export const LOOK_VARS = ['--sel', '--hi', '--text', '--panel'] as const
// size: body text px. list: the MENU pane's rows px. menu: the menu names, in % of their drawn size.
export const LOOK_SIZES = { size: [11, 18, 13], list: [11, 20, 13], menu: [70, 140, 100] } as const
export type SizeKey = keyof typeof LOOK_SIZES
export type Look = { vars: Partial<Record<(typeof LOOK_VARS)[number], string>> } & Partial<Record<SizeKey, number>>
export const NO_LOOK: Look = { vars: {} }

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export const parseLook = (raw: string | null): Look => {
  try {
    const v = JSON.parse(raw ?? '')
    const look: Look = { vars: Object.fromEntries(LOOK_VARS.filter(k => isColor(v?.vars?.[k])).map(k => [k, v.vars[k]])) }
    for (const [k, [min, max]] of Object.entries(LOOK_SIZES) as [SizeKey, readonly number[]][]) if (Number.isInteger(v?.[k]) && v[k] >= min && v[k] <= max) look[k] = v[k]
    return look
  } catch { return NO_LOOK }
}
