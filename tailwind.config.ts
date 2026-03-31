import { type Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
        display: ['var(--font-display)', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        surface: {
          DEFAULT: 'var(--color-surface)',
          muted: 'var(--color-surface-muted)',
        },
        foreground: 'var(--color-foreground)',
        border: 'var(--color-border)',
        brand: {
          primary: 'var(--color-brand-primary)',
          secondary: 'var(--color-brand-secondary)',
          accent: 'var(--color-brand-accent)',
          muted: 'var(--color-brand-muted)',
        },
      },
      boxShadow: {
        card: '0 20px 45px rgba(15, 23, 42, 0.12)',
      },
      borderRadius: {
        xl: '1.5rem',
      },
    },
  },
  plugins: [],
} satisfies Config
