# Edge Checkin Bot

<!-- badges:start -->
[![License](https://img.shields.io/github/license/monkey-sking/edge-checkin-bot?style=flat-square)](https://github.com/monkey-sking/edge-checkin-bot/blob/main/LICENSE) [![Last commit](https://img.shields.io/github/last-commit/monkey-sking/edge-checkin-bot?style=flat-square)](https://github.com/monkey-sking/edge-checkin-bot/commits/main) [![JavaScript](https://img.shields.io/github/languages/top/monkey-sking/edge-checkin-bot?style=flat-square)](https://github.com/monkey-sking/edge-checkin-bot/search?l=JavaScript) [![views](https://hits.sh/github.com/monkey-sking/edge-checkin-bot.svg?style=flat-square&label=views&color=0e75b6)](https://github.com/monkey-sking/edge-checkin-bot)
<!-- badges:end -->

AI 中转站每日自动签到机器人，支持多个站点令牌模式签到。

## 功能特性

- 🤖 自动签到多个 AI 中转站点
- 🔐 使用长期访问令牌，无需频繁登录
- ⏰ 支持定时任务和后台守护进程
- 📝 详细日志记录
- 🔄 自动处理 Cloudflare 验证

## 支持站点

- 君の公益 (muyuan.do)
- LyClaude (free.lyclaude.site)
- AnyRouter (anyrouter.top)
- AI1692958 (ai.1692958.xyz)

## 安装依赖

```bash
npm install
```

## 使用方法

### 首次配置

1. **获取令牌**（首次使用或令牌过期时）：

```bash
node relogin-gettoken.js
```

脚本会打开 Edge 浏览器并加载各站点登录页，请在浏览器中完成登录。脚本会自动提取令牌并保存到 `tokens.json`。

### 手动签到

```bash
node checkin.js
```

### 自动签到

使用 Windows 任务计划程序配合 `start-daemon.vbs` 实现开机自启和每日定时签到。

## 文件说明

- `checkin.js` - 主签到脚本
- `relogin-gettoken.js` - 令牌获取脚本
- `daemon.js` - 守护进程
- `tokens.json` - 令牌存储（敏感文件，已加入 .gitignore）
- `state.json` - 浏览器状态（包含 Cloudflare cookie，已加入 .gitignore）
- `checkin-log.txt` - 签到日志

## 技术栈

- Node.js
- Playwright
- Microsoft Edge

## 安全说明

⚠️ **重要**：`tokens.json` 和 `state.json` 包含敏感登录信息，请勿提交到公开仓库。

## License

MIT
