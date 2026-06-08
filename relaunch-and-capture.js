// 一体化：用真实资料 + 调试端口重启 Edge → 打开三个登录页 → 常驻轮询，
// 每个站点一旦检测到登录成功，立即把它的 cookie+localStorage 落盘到 state.json。
// 关键：从重启到抓取，浏览器始终不关，避免会话 cookie 失效。
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { chromium } = require('playwright-core');

const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const UDD = 'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\Edge\\User Data';
const PORT = 9222;
const STATE = path.join(__dirname, 'state.json');
const REPORT = path.join(__dirname, 'login-status.json');

const TARGETS = [
  { key: 'freemodel', loginUrl: 'https://freemodel.dev/',            check: 'https://freemodel.dev/dashboard', loggedOutRe: /\/$|login|signin|\/auth/i },
  { key: 'anyrouter', loginUrl: 'https://anyrouter.top/login',       check: 'https://anyrouter.top/console',   loggedOutRe: /login|signin|\/auth/i },
  { key: 'muyuan',    loginUrl: 'https://muyuan.do/login',           check: 'https://muyuan.do/console/topup', loggedOutRe: /login|expired/i },
  { key: 'lyclaude',  loginUrl: 'https://free.lyclaude.site/',       check: 'https://free.lyclaude.site/console', loggedOutRe: /login|signin|\/auth/i },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitCDP(ms) {
  const http = require('http');
  const deadline = Date.now ? null : null; // Date.now ok in node runtime
  const end = (new Date()).getTime() + ms;
  while ((new Date()).getTime() < end) {
    const ok = await new Promise(res => {
      const req = http.get(`http://127.0.0.1:${PORT}/json/version`, r => { r.resume(); res(r.statusCode === 200); });
      req.on('error', () => res(false)); req.setTimeout(1500, () => { req.destroy(); res(false); });
    });
    if (ok) return true;
    await sleep(800);
  }
  return false;
}

async function dumpOrigin(ctx, page, origin) {
  const cookies = await ctx.cookies(origin);
  const ls = await page.evaluate(() => { const o = {}; try { for (let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);} } catch(e){} return o; });
  return { cookies, localStorage: Object.entries(ls).map(([name, value]) => ({ name, value })) };
}

(async () => {
  // 1) 关闭全部 Edge
  spawnSync('taskkill', ['/F', '/IM', 'msedge.exe'], { shell: false });
  await sleep(2500);

  // 2) 调试端口 + 真实资料重启
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${UDD}`, '--restore-last-session', '--no-first-run'], { detached: true, stdio: 'ignore' });
  child.unref();

  if (!await waitCDP(20000)) { console.log('CDP_FAIL'); process.exit(2); }
  console.log('CDP_READY');

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0] || (await browser.newContext());

  // 3) 打开三个登录页
  const pages = {};
  for (const t of TARGETS) {
    const p = await ctx.newPage();
    pages[t.key] = p;
    try { await p.goto(t.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) {}
  }
  console.log('TABS_OPEN 请在窗口里登录三个站点');

  // 4) 常驻轮询：每站登录成功就立刻抓取
  const captured = {};
  const collected = { cookies: [], origins: [] };
  const cookieMap = new Map();
  const deadline = (new Date()).getTime() + 15 * 60 * 1000; // 最多等 15 分钟

  while (Object.keys(captured).length < TARGETS.length && (new Date()).getTime() < deadline) {
    for (const t of TARGETS) {
      if (captured[t.key]) continue;
      const p = pages[t.key];
      try {
        // 用同一页打开受保护页判断是否登录（不新开，避免乱）
        await p.goto(t.check, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await p.waitForTimeout(1500);
        const url = p.url();
        const loggedOut = t.loggedOutRe.test(url);
        if (!loggedOut) {
          const origin = new URL(t.check).origin;
          const dump = await dumpOrigin(ctx, p, origin);
          for (const c of dump.cookies) cookieMap.set(`${c.name}|${c.domain}|${c.path}`, c);
          collected.origins = collected.origins.filter(o => o.origin !== origin).concat([{ origin, localStorage: dump.localStorage }]);
          captured[t.key] = { url, cookieCount: dump.cookies.length };
          console.log(`CAPTURED ${t.key} (${dump.cookies.length} cookies)`);
          // 回到登录页停留，避免反复刷新受保护页
          await p.goto(t.loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
        }
      } catch (e) {}
    }
    collected.cookies = Array.from(cookieMap.values());
    fs.writeFileSync(STATE, JSON.stringify(collected, null, 2));
    fs.writeFileSync(REPORT, JSON.stringify({ captured, pending: TARGETS.map(t=>t.key).filter(k=>!captured[k]) }, null, 2));
    if (Object.keys(captured).length < TARGETS.length) await sleep(5000);
  }

  fs.writeFileSync(STATE, JSON.stringify(collected, null, 2));
  fs.writeFileSync(REPORT, JSON.stringify({ captured, pending: TARGETS.map(t=>t.key).filter(k=>!captured[k]), done: true }, null, 2));
  console.log('ALL_DONE captured=' + Object.keys(captured).join(','));
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
