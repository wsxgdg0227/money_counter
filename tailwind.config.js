/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f8ff',
          100: '#e9efff',
          500: '#3b82f6',
          600: '#2563eb'
        }
      }
    }
  },
  plugins: []
}
