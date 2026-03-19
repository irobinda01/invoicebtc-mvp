/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        orange: {
          500: '#f7931a',
          600: '#e8840e',
        },
      },
    },
  },
  plugins: [],
}
