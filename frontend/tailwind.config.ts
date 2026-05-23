import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        unfpa: {
          blue: '#00658C',
          light: '#0088BB',
          dark: '#004A66',
        },
        status: {
          on_track: '#16a34a',
          behind: '#d97706',
          critical: '#dc2626',
        },
      },
      fontFamily: {
        bangla: ['Hind Siliguri', 'Noto Sans Bengali', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
