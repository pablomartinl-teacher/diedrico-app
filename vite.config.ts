import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/diedrico-app/', // <-- AÑADE ESTA LÍNEA (ej: '/diedrico-app/')
  plugins: [react()],
})
