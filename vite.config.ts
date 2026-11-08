import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  server: {
    // 局域网调试：手机访问电脑的局域网 IP
    host: true,
  },
})
