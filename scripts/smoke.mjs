/**
 * 端到端冒烟测试（需要先运行 npm run dev）。
 * 用本机 Chrome 打开两个标签页，验证创建房间、加入、落子同步、聊天和悔棋。
 * 运行：node scripts/smoke.mjs
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:5173'
const OUT = process.env.SMOKE_OUT ?? 'C:/Users/dream/AppData/Local/Temp/xiangqi-smoke'
mkdirSync(OUT, { recursive: true })

const errors = []

function watch(page, label) {
  page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`)
  })
}

async function boardClick(page, x, y, touch = false) {
  const box = await page.locator('.board-svg').boundingBox()
  if (!box) throw new Error('找不到棋盘')
  const px = box.x + (x / 900) * box.width
  const py = box.y + (y / 1000) * box.height
  if (touch) await page.touchscreen.tap(px, py)
  else await page.mouse.click(px, py)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'zh-CN',
})
const pageA = await context.newPage()
const pageB = await context.newPage()
watch(pageA, '红方')
watch(pageB, '黑方')

try {
  await pageA.goto(BASE)
  await pageA.getByRole('button', { name: /创建房间/ }).click()
  await pageA.waitForSelector('.room-code')
  const room = (await pageA.locator('.room-code').textContent()).trim()
  if (!room) throw new Error('没有生成房间码')
  console.log(`✓ 创建房间：${room}`)
  await pageA.screenshot({ path: `${OUT}/01-room-waiting.png` })

  await pageB.goto(`${BASE}/#/r/${room}`)
  await pageB.waitForSelector('.room-code')
  await pageB.waitForFunction(
    () =>
      [...document.querySelectorAll('.player-row')].some((row) => {
        const text = row.textContent ?? ''
        return text.includes('黑方 · 后手') && text.includes('（你）')
      }),
    { timeout: 15_000 },
  )
  console.log('✓ 第二位玩家加入并分配到黑方')

  await pageA.getByText('轮到你走棋').waitFor({ timeout: 15_000 })
  console.log('✓ 房主看到对方在线并轮到自己')

  // 红方兵 (6,0) -> (5,0)
  await boardClick(pageA, 50, 650)
  await pageA.waitForSelector('.legal-dot')
  await boardClick(pageA, 50, 550)
  await pageA.waitForFunction(() => document.querySelectorAll('.move-list li').length === 1)
  await pageB.waitForFunction(() => document.querySelectorAll('.move-list li').length === 1)
  const notation = (await pageB.locator('.move-text').first().textContent())?.trim()
  console.log(`✓ 落子已同步，记谱：${notation}`)
  if (notation !== '兵九进一') throw new Error(`记谱不正确：${notation}`)

  await pageA.locator('.desktop-chat input').fill('你好，这盘我赢了')
  await pageA.locator('.desktop-chat input').press('Enter')
  await pageB.waitForFunction(() => document.querySelectorAll('.chat-message').length >= 1)
  console.log('✓ 聊天消息已同步')

  // 黑方视角是翻转棋盘：黑卒 (3,0) 显示在 (6,8)，走到 (4,0) 显示在 (5,8)
  await pageB.screenshot({ path: `${OUT}/02b-black-view.png` })
  await boardClick(pageB, 850, 650)
  await pageB.waitForSelector('.legal-dot')
  await boardClick(pageB, 850, 550)
  await pageA.waitForFunction(() => document.querySelectorAll('.move-list li').length === 2)
  await pageB.waitForFunction(() => document.querySelectorAll('.move-list li').length === 2)
  console.log('✓ 黑方翻转视角落子已同步')

  await pageB.locator('.actions-panel button', { hasText: '悔棋' }).click()
  await pageA.getByText(/请求悔棋/).waitFor({ timeout: 10_000 })
  await pageA.getByRole('button', { name: '同意' }).click()
  await pageA.waitForFunction(() => document.querySelectorAll('.move-list li').length === 1)
  await pageB.waitForFunction(() => document.querySelectorAll('.move-list li').length === 1)
  console.log('✓ 悔棋请求/同意已同步')

  await pageA.screenshot({ path: `${OUT}/02-desktop-game.png` })

  // 移动端本地双人
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  })
  const pageM = await mobile.newPage()
  watch(pageM, '移动端')
  await pageM.goto(`${BASE}/#/local`)
  await pageM.waitForSelector('.board-svg')
  await pageM.screenshot({ path: `${OUT}/03-mobile-lobby.png` })

  // 红方兵 (6,4) -> (5,4)
  await boardClick(pageM, 450, 650, true)
  await pageM.waitForSelector('.legal-dot')
  await boardClick(pageM, 450, 550, true)
  await pageM.waitForFunction(() => document.querySelectorAll('.move-list li').length === 1)
  await pageM.screenshot({ path: `${OUT}/04-mobile-game.png` })
  console.log('✓ 移动端本地对局可落子')
  await mobile.close()
} finally {
  await browser.close()
}

if (errors.length > 0) {
  console.error('页面错误：')
  for (const error of errors) console.error(` - ${error}`)
  process.exit(1)
}

console.log(`\n全部通过。截图目录：${OUT}`)
