/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          900: '#0B1F3A',
          800: '#12305A',
          700: '#1A4380',
          600: '#1F5099',
        },
        neutral: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          500: '#64748B',
          700: '#334155',
        },
        ink: '#0F172A',
        danger: { 700: '#B91C1C', 600: '#DC2626', 50: '#FEF2F2' },
        success: { 800: '#166534', 700: '#15803D', 600: '#16A34A', 50: '#F0FDF4' },
        warning: { DEFAULT: '#FFFBEB', text: '#B45309' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.75rem',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,23,42,0.06)',
        md: '0 4px 12px rgba(15,23,42,0.10)',
      },
    },
  },
  plugins: [],
};