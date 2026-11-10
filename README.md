# 中国象棋 · 双人在线对弈

一个纯前端实现的中国象棋网页游戏，电脑和手机浏览器都能玩。两个人通过房间码或邀请链接进入同一间房对局，无需注册账号。

## 功能

- 房间码创建 / 加入，邀请链接一键复制
- 完整的中国象棋规则：马腿、象眼、炮架、九宫、过河兵、将帅照面、将死与困毙
- **揭棋玩法**：暗子首步按所在布阵格走、走完翻开；士可出九宫过河、象可过河；暗子随机布局，本地/联机均可
- 悔棋 / 求和 / 认输（悔棋、求和需对方同意）
- 可选对局计时：每步限时 + 每人总用时，可单独或同时开启，到时自动判负；对方离线时计时自动暂停，重连后继续
- 文字聊天
- 走子音效与「将军」语音提示（语音合成，无中文语音时回退为提示音；无需外部音频文件）
- 将死（绝杀）时的全屏「绝杀」光效 + 冲击音效
- 中文记谱棋谱、上一步标记、将军提示
- 黑方自动翻转棋盘（文字保持正向）
- 断线自动重连，刷新后恢复棋局
- 本地双人模式（同一台设备轮流走棋）

## 技术栈

Vite 8 + React 19 + TypeScript + Vitest。规则引擎是独立的纯 TypeScript 模块，不依赖 React。
实时同步默认使用 [GoEasy](https://www.goeasy.io/)（杭州节点，免费版 500 日活 / 10 万条消息每月）；未配置 GoEasy 时自动降级为同浏览器多标签页联调（BroadcastChannel）。

构建产物是**单个 `dist/index.html`**（JS/CSS 全部内联），部署时只需上传这一个文件。

## 本地开发

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。不配置 GoEasy 时：

1. 点「创建房间」，记下房间码。
2. 在同一浏览器的另一个标签页打开 `http://localhost:5173/#/r/<房间码>`。
3. 两个标签页即可对局（一个执红、一个执黑）。

## 配置 GoEasy（真机 / 跨网络联机必需）

1. 注册 [GoEasy 控制台](https://console.goeasy.io/)，创建一个应用（免费版即可）。
2. 复制应用的 **Common Key**。
3. 在项目根目录新建 `.env.local`：

   ```bash
   VITE_GOESAY_APPKEY=你的CommonKey
   VITE_GOESAY_HOST=hangzhou.goeasy.io
   ```

4. 重启 `npm run dev`。页面顶部不再出现「未配置 GoEasy」提示即生效。

> Common Key 会出现在前端代码里，这是 GoEasy 的正常设计。建议在控制台配置域名白名单，降低被滥用的风险。

## 测试

```bash
npm test          # 规则引擎单元测试（perft 44 / 1920 / 79666 等 25 项）
npm run smoke     # 浏览器端到端冒烟测试
```

`npm run smoke` 需要：

- 本机安装了 Chrome
- 开发服务器已在 `http://127.0.0.1:5173` 运行（可用 `SMOKE_BASE` 指定其他地址）

它会打开两个标签页，自动验证创建房间、加入、落子同步、聊天、悔棋和移动端本地对局，截图保存在系统临时目录 `xiangqi-smoke/`。
针对生产构建测试：

```bash
npm run build
npm run preview -- --port 4173
SMOKE_BASE=http://127.0.0.1:4173 npm run smoke
```

## 构建与部署（Cloudflare Pages）

```bash
npm run build     # 输出 dist/index.html
npm run preview   # 本地预览生产构建
```

### 方式一：直接上传（不需要 Git，最快）

1. 本地执行 `npm run build`，确认生成 `dist/index.html`。
2. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/) → **Workers 和 Pages** → **创建** → **Pages** → **上传资产**（Upload assets）。
3. 项目名填写例如 `xiangqi`，创建项目。
4. 把 `dist` 文件夹拖进上传框（或选择该文件夹），点部署。
5. 得到 `https://xiangqi.pages.dev`，发给朋友即可。

之后每次更新：重新 `npm run build`，在项目页点「创建新部署」，再上传新的 `dist` 文件夹。

### 方式二：连接 Git 仓库（推送自动部署）

1. 把项目推到 GitHub（`.env.local` 已被 `.gitignore` 忽略，不会泄露密钥）。
2. Cloudflare Pages → **连接到 Git** → 选择仓库。
3. 构建配置：
   - Framework preset：`None`
   - Build command：`npm run build`
   - Build output directory：`dist`
4. 在 **Settings → Environment variables** 添加（Production 和 Preview 都要加）：
   - `VITE_GOESAY_APPKEY`：你的 Common Key
   - `VITE_GOESAY_HOST`：`hangzhou.goeasy.io`
   - `NODE_VERSION`：`22`（项目里也提供了 `.nvmrc`）
5. 保存并部署；以后每次 `git push` 自动重新构建。

> `VITE_*` 变量在构建时写入页面，修改环境变量后需要重新部署才生效。

### 命令行部署（可选）

```bash
npx wrangler pages project create xiangqi
npx wrangler pages deploy dist --project-name xiangqi
```

首次运行会打开浏览器要求登录 Cloudflare。适合后续快速更新。

> 部署后建议在 GoEasy 控制台把允许的域名限制为你的 `*.pages.dev` 域名和本地开发地址。Common Key 出现在前端是正常设计，域名白名单可以降低被滥用的风险。

部署完成后把站点链接发给朋友。同一份 `dist/index.html` 也可以直接上传到 Netlify、GitHub Pages、CloudBase 静态托管等任何静态服务作备用。

> 国内访问 Cloudflare Pages 的稳定性因网络而异。如果朋友那边打开慢，可以把同一个构建再部署一份到其他静态托管，两个链接都能用。

## 玩法说明

1. 一方点「创建房间」，复制邀请链接发给对方；对方用手机或电脑打开链接，也可以手动输入 6 位房间码。创建前可在「对局时限」中选择每步限时 / 每人总用时（可选，超时自动判负）。
2. 创建者执红先行，加入者执黑后行。
3. 点自己的棋子，出现圆点后点目标位置落子。
4. 顶部显示房间码和连接状态；右侧（手机上在下方）是棋谱、操作按钮和聊天。

## 目录结构

```text
src/
  game/       规则引擎（FEN、着法生成、合法性、记谱、perft）
  net/        房间码、传输层、会话状态机、本地存储
    GoEasyTransport.ts   生产环境 WebSocket 同步
    LocalTransport.ts    同浏览器多标签联调
  ui/         SVG 棋盘、大厅、对局界面、聊天、弹窗
  styles/     全局样式与响应式布局
tests/engine/ 规则单元测试
scripts/      浏览器冒烟测试
```

## 已知限制

- 客户端权威：双方各自校验着法，没有服务器裁判，不适合有奖惩的正式比赛。
- 免费版 GoEasy 不保存历史消息，棋局状态保存在双方浏览器本地并通过 `sync` 互相同步；双方都清空浏览器数据后无法恢复。
- 未实现长将、长捉等正式规则；同一局面出现 3 次自动判和。
- 暂不支持观战、AI 对手、计时器和账号系统。
- 房间码即房间凭证，请只发给对局的朋友。
