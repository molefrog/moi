import type { Config } from 'tailwindcss'

// Compact headings shared by every prose-sm surface in the app.
export default {
  theme: {
    extend: {
      typography: {
        sm: {
          css: {
            h1: {
              fontSize: '1.375rem',
              fontWeight: '500',
              lineHeight: '1.375',
              marginTop: '1.25rem',
              marginBottom: '0.625rem'
            },
            h2: {
              fontSize: '1.125rem',
              fontWeight: '500',
              lineHeight: '1.375',
              marginTop: '1.25rem',
              marginBottom: '0.625rem'
            },
            h3: {
              fontSize: '1rem',
              fontWeight: '500',
              lineHeight: '1.375',
              marginTop: '1.25rem',
              marginBottom: '0.625rem'
            },
            h4: {
              fontSize: '0.875rem',
              fontWeight: '500',
              lineHeight: '1.375',
              marginTop: '1.25rem',
              marginBottom: '0.625rem'
            }
          }
        }
      }
    }
  }
} satisfies Config
