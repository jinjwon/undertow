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
    xterm: { background: '#00000000', foreground: '#F5F5F5', cursor: '#FF1A2D', selectionBackground: '#8A0010', red: '#FF1A2D', cyan: '#F5F5F5', blue: '#FF1A2D', magenta: '#FFE500' },
    monaco: {
      rules: { comment: '7A7A7A', keyword: 'FF1A2D', string: 'FFD6D6', number: 'FFE500', type: 'FFFFFF' },
      colors: { fg: '#F5F5F5', line: '#FF1A2D1F', select: '#FF1A2D66', cursor: '#FF1A2D', num: '#4A4A4A', numOn: '#FF1A2D' },
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
