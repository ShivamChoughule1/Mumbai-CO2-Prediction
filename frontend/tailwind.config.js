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
        'electric-blue': '#00d4ff',
        'neon-cyan': '#00f2ff',
      },
    },
  },
  plugins: [],
}
