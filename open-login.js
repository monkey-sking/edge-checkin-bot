// 打开签到专用 Edge 窗口，让用户一次性登录三个站点。
// 进程常驻（保持窗口开着），登录完成后由外部 kill。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const PROFILE = path.join(__dirname, 'profile');
const SITES = [
  'https://freemodel.dev/dashboard',
  'https://anyrouter.top/console',
  'https://muyuan.do/console/topup',
  'https://free.lyclaude.site/console',
];

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    channel: 'msedge',
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--start-maximized'],
  });

  fs.writeFileSync(path.join(__dirname, 'login.pid'), String(process.pid));

  for (let i = 0; i < SITES.length; i++) {
    const page = i === 0 ? (ctx.pages()[0] || await ctx.newPage()) : await ctx.newPage();
    try {
      await page.goto(SITES[i], { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      console.log('open failed:', SITES[i], e.message);
    }
  }

  console.log('READY: 三个标签页已打开，请在窗口里逐个登录，然后回到对话告诉我“登录好了”。');
  await new Promise(() => {}); // 常驻，等待外部结束
})();
