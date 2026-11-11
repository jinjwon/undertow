// The looks the window can wear. CSS reads the vars; Monaco and xterm get their own colours from the same entry.
// A new theme is one more entry here plus its block in style.css (background, selection shape).
import tideLogo from '../../assets/logo-tide.png'
import rebelLogo from '../../assets/logo-rebel.png'

export const THEMES = {
  tide: {
    label: 'TIDE',
    logo: tideLogo,
    // ANSI blue is lighter than the brand blue: #064DE8 on black is too dim to read.
    xterm: { background: '#00000000', foreground: '#FFFFFF', cursor: '#16D9F5', cursorAccent: '#050505', selectionBackground: '#064DE8', cyan: '#16D9F5', blue: '#5B8CFF' },
    monaco: {
      base: 'vs',
      // Strings use a darkened cyan: #16D9F5 on the white page is too faint to read.
      rules: { comment: '6B7390', keyword: '064DE8', string: '0B7E93', number: '064DE8', type: '06145B' },
      // The light base paints markup red and green; keep it in the menu's colours.
      extra: [{ token: 'tag', foreground: '064DE8' }, { token: 'metatag', foreground: '064DE8' }, { token: 'attribute.name', foreground: '06145B' }, { token: 'attribute.value', foreground: '0B7E93' }],
      // Opaque on purpose: on a light base, a transparent page paints Monaco's overview ruler black and lets sticky lines show through.
      colors: { bg: '#FFFFFF', fg: '#06145B', line: '#16D9F522', select: '#16D9F566', cursor: '#064DE8', num: '#8890A8', numOn: '#064DE8' },
    },
  },
  rebel: {
    label: 'REBEL',
    logo: rebelLogo,
    // Blood red, pitch black, stark white: every ANSI colour folds onto one of the three.
    xterm: {
      background: '#00000000', foreground: '#FFFFFF', cursor: '#B8001F', cursorAccent: '#000000', selectionBackground: '#B8001F',
      black: '#000000', red: '#B8001F', green: '#FFFFFF', yellow: '#FFFFFF', blue: '#B8001F', magenta: '#B8001F', cyan: '#FFFFFF', white: '#FFFFFF',
      brightBlack: '#B8001F', brightRed: '#B8001F', brightGreen: '#FFFFFF', brightYellow: '#FFFFFF', brightBlue: '#B8001F', brightMagenta: '#B8001F', brightCyan: '#FFFFFF', brightWhite: '#FFFFFF',
    },
    monaco: {
      base: 'vs-dark',
      extra: [],
      rules: { comment: 'B8001F', keyword: 'B8001F', string: 'FFFFFF', number: 'B8001F', type: 'FFFFFF' },
      colors: { bg: '#00000000', fg: '#FFFFFF', line: '#B8001F26', select: '#B8001F80', cursor: '#B8001F', num: '#B8001F', numOn: '#FFFFFF' },
    },
  },
} as const

export type ThemeName = keyof typeof THEMES
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]

export const defineThemes = (monaco: any) => {
  for (const name of THEME_NAMES) {
    const { base, extra, rules: r, colors: c } = THEMES[name].monaco
    monaco.editor.defineTheme(`evoke-${name}`, {
      base,
      inherit: true,
      rules: [
        { token: 'comment', foreground: r.comment, fontStyle: 'italic' },
        { token: 'keyword', foreground: r.keyword },
        { token: 'string', foreground: r.string },
        { token: 'number', foreground: r.number },
        { token: 'type', foreground: r.type, fontStyle: 'bold' },
        ...extra,
      ],
      colors: {
        'editor.background': c.bg,
        'minimap.background': c.bg,
        'editor.foreground': c.fg,
        'editor.lineHighlightBackground': c.line,
        'editor.selectionBackground': c.select,
        'editorCursor.foreground': c.cursor,
        focusBorder: c.cursor, // Monaco's own focus ring is blue: keep it in the theme's colour
        'editorLineNumber.foreground': c.num,
        'editorLineNumber.activeForeground': c.numOn,
      },
    })
  }
}
