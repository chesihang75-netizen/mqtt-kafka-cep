/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        accent: '#f97316',
        success: '#16a34a',
        warning: '#facc15',
        danger: '#dc2626',
      },
    },
  },
  plugins: [],
};
