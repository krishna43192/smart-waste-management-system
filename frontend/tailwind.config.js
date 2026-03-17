/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b'
        }
      },
      backgroundImage: {
        'grid-slate': 'radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.12) 1px, transparent 0)',
        'brand-radial': 'radial-gradient(circle at top, rgba(20, 184, 166, 0.15), transparent 55%)'
      },
      boxShadow: {
        glow: '0 20px 60px -25px rgba(16, 185, 129, 0.55)',
        innerSoft: 'inset 0 1px 0 rgba(255,255,255,0.4)'
      },
      borderRadius: {
        '4xl': '2.5rem'
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}

export default config