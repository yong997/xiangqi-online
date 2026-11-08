import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 目标浏览器里包含较旧的手机内核（微信 X5 / 旧版 iOS Safari 等）。
// 这样 lightningcss 会把 @media (max-width: …) 保留为兼容写法，
// 而不会压成这些内核不支持的 MQ4 区间语法「(width <= 980px)」，
// 避免手机上整段响应式样式被忽略、棋盘被右侧栏挤成一条。
const browserTargets = {
  chrome: 87 << 16,
  edge: 88 << 16,
  firefox: 78 << 16,
  safari: 14 << 16,
  ios_saf: 14 << 16,
  android: 87 << 16,
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  css: {
    lightningcss: {
      targets: browserTargets,
    },
  },
  build: {
    // CSS 压缩阶段同样使用上面的目标浏览器，避免 @media (max-width) 被压成
    // 旧内核不支持的区间语法。cssTarget 在 lightningcss 压缩时优先级更高。
    cssTarget: ['chrome87', 'safari14', 'firefox78', 'edge88'],
  },
  server: {
    // 局域网调试：手机访问电脑的局域网 IP
    host: true,
  },
})
