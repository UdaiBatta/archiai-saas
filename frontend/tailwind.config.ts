import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

// ArchiAI design tokens — dark ash-gray / graphite system with white as the
// primary accent. One consistent product layout: the website pages, the
// editor chrome, and the canvases all draw from this single scale.
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // True-neutral ladder centered on #212121 (the approved base) — no
        // blue tint anywhere in the chrome; color only lives inside plans.
        graphite: {
          950: '#191919', // deepest — editor grid wells
          900: '#212121', // app background
          850: '#262626', // page section alternation
          800: '#2B2B2C', // panels
          750: '#313132', // raised panels / hover surfaces
          700: '#363637', // inputs
          600: '#414143', // strong borders / disabled surfaces
          500: '#505053', // disabled text on panels
          400: '#6A6A6E',
          300: '#909094',
          200: '#BDBDC0',
          100: '#DFDFE1',
          50: '#F5F5F6',
        },
        // Semantic tokens (dark theme): ink = primary text, muted = secondary,
        // muted-light = tertiary/disabled, surface = app background.
        ink: '#F5F5F6',
        muted: { DEFAULT: '#A8A8AC', light: '#7C7C80' },
        surface: '#212121',
        // The single interactive/primary accent (selection, active tabs,
        // primary buttons, focus rings). Previously hardcoded as #7663d7 /
        // #8069df across ~9 components — now every consumer draws from here.
        accent: {
          DEFAULT: '#7663D7',
          bright: '#8069DF',
          soft: 'rgba(118, 99, 215, 0.16)',
          dim: '#5B4CB0',
        },
        // Status colors, deliberately muted per the approved direction.
        ok: '#8FAE94',
        warn: '#C9A96E',
        danger: '#C97B70',
      },
      fontFamily: {
        sans: ['Archivo', ...defaultTheme.fontFamily.sans],
        mono: ['"IBM Plex Mono"', ...defaultTheme.fontFamily.mono],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        // Use behind motion-safe: so reduced-motion users get none of it.
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22, 0.9, 0.3, 1) both',
        'fade-in': 'fade-in 0.25s ease both',
        'slide-down': 'slide-down 0.4s cubic-bezier(0.22, 0.9, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}

export default config
