import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Keeps the API same-origin in dev, so no CORS and no API base URL in code.
    proxy: { '/api': 'http://localhost:4000' },
  },
})
