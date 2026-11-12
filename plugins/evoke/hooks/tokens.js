// The design tokens, shared by the plugin pane (register.tsx) and the desktop pane (Pane.tsx).
// desktop/src/style.css (TIDE) uses the same colours: change them together.
export const COLOR = {
  INK: '#01030C', // the HUD's plate: far enough from NAVY that the shader leaves them solid
  ABYSS: '#050A24', // dark planes and bands
  NAVY: '#0B1648', // the terminal's own background: the shader turns exactly this into water
  MIDNIGHT: '#13257A', // panels and bands
  OCEAN: '#1546E0', // the active area
  CYAN: '#5FE3FF', // secondary information and things to press
  ICE: '#D6F4FF', // quiet text
  WHITE: '#FFFFFF',
  BLACK: '#000000',
  RED: '#E8101E', // selection and warnings, nothing else
  PINK: '#FF2E88', // the selection cursor's edge
  GRAY: '#8A96B8', // what is not in use
}

// One cell of the pane in art units: the art is laid out on the cell grid of a 56 x 41 pane.
export const ART = { width: 1120, height: 2050, cellY: 50 }

// Where the stage ends and the content starts, in rows of that 41-row grid.
export const GRID = { rows: 41, content: 22, footer: 38 }

export const MENUS = ['SKILL', 'ITEM', 'EQUIP', 'AGENT', 'STATUS', 'QUEST', 'LINK', 'CALENDAR', 'SYSTEM']

// The crooked column of menu names; the pane puts each key on the row its name is drawn at.
export const ITEM_ROWS = MENUS.map((_, i) => ({ x: 430 + [70, 110, 40, 30, 85, 55, 95, 10, 75][i], y: 318 + i * 78, tilt: [-7, -5, -8, -6, -9, -5, -8, -6, -7][i] }))
