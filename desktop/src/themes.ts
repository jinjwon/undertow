// The looks the window can wear. CSS reads the vars; Monaco and xterm get their own colours from the same entry.
// A new theme is one more entry here plus its block in style.css (background, selection shape).
import tideLogo from '../../assets/logo-tide.png'
import rebelLogo from '../../assets/logo-rebel.png'

export const THEMES = {
  tide: {
    label: 'TIDE',
    logo: tideLogo,
    xterm: { background: '#00000000', foreground: '#D6F4FF', cursor: '#5FE3FF', selectionBackground: '#1546E0', red: '#E8101E', cyan: '#5FE3FF', blue: '#1546E0', magenta: '#FF2E88' },
    monaco: {
      rules: { comment: '8A96B8', keyword: '5FE3FF', string: 'FFB3D1', number: 'FF2E88', type: 'D6F4FF' },
      colors: { fg: '#D6F4FF', line: '#13257A66', select: '#1546E099', cursor: '#FF2E88', num: '#3A4A8A', numOn: '#5FE3FF' },
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
      rules: { comment: 'B8001F', keyword: 'B8001F', string: 'FFFFFF', number: 'B8001F', type: 'FFFFFF' },
      colors: { fg: '#FFFFFF', line: '#B8001F26', select: '#B8001F80', cursor: '#B8001F', num: '#B8001F', numOn: '#FFFFFF' },
    },
  },
} as const

export type ThemeName = keyof typeof THEMES
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]

export const defineThemes = (monaco: any) => {
  for (const name of THEME_NAMES) {
    const { rules: r, colors: c } = THEMES[name].monaco
    monaco.editor.defineTheme(`evoke-${name}`, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: r.comment, fontStyle: 'italic' },
        { token: 'keyword', foreground: r.keyword },
        { token: 'string', foreground: r.string },
        { token: 'number', foreground: r.number },
        { token: 'type', foreground: r.type, fontStyle: 'bold' },
      ],
      colors: {
        'editor.background': '#00000000',
        'minimap.background': '#00000000',
        'editor.foreground': c.fg,
        'editor.lineHighlightBackground': c.line,
        'editor.selectionBackground': c.select,
        'editorCursor.foreground': c.cursor,
        'editorLineNumber.foreground': c.num,
        'editorLineNumber.activeForeground': c.numOn,
      },
    })
  }
}
