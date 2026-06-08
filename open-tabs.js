// 在当前调试模式的真实 Edge 里打开三个登录页，留着不关，供用户登录。
const { chromium } = require('playwright-core');
const TARGETS = [
  'https://freemodel.dev/',
  'https://anyrouter.top/login',
  'https://muyuan.do/login',
  'https://free.lyclaude.site/',
];
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || (await browser.newContext());
  let first = null;
  for (const url of TARGETS) {
    const page = await ctx.newPage();
    if (!first) first = page;
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
    catch (e) { console.log('open failed', url, e.message); }
  }
  if (first) await first.bringToFront().catch(() => {});
  console.log('OPENED 4 login tabs');
  // 不关页面、不关浏览器，仅断开 CDP
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
