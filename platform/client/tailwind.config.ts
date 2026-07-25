import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ported from mockup/screen-1.html
        bg: '#0d1117',
        panel: '#161b22',
        line: '#21262d',
        ink: '#e7e9ea',
        muted: '#8b949e',
        cyan: '#06b6d4',
        red: '#ef4444',
        amber: '#f59e0b',
        yellow: '#eab308',
        green: '#22c55e',
        orange: '#c2410c',
        brick: '#b04a3a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
