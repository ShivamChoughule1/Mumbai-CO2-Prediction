/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mumbai-navy': '#0a192f',
        'mumbai-card': '#112240',
        'mumbai-card-hover': '#233554',
        'electric-blue': '#00d4ff',
        'neon-cyan': '#00f2ff',
        'alert-green': '#10b981',
        'alert-yellow': '#fbbf24',
        'alert-red': '#ef4444'
      },
    },
  },
  plugins: [],
}