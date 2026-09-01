/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // RBH brand palette carried over from the legacy HTML
        rbh: {
          navy: '#0A1628',
          navy2: '#0F2040',
          blue: '#1155A6',
          blue2: '#1A72CC',
          accent: '#E8721A',
          accent2: '#FF8C2A',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [require('tailwindcss-primeui')],
};
