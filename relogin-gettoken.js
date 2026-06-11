// 关 Edge→调试模式重启真实资料→弹 muyuan 登录页→等用户登录→
// 各站登录后用 GET /api/user/token 生成长期令牌，写 tokens.json，并刷新 state.json（含 cf_clearance）。
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { chromium } = require('playwright-core');

const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const UDD = 'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\Edge\\User Data';
const PORT = 9222;
const STATE = path.join(__dirname, 'state.json');
const TOKENS = path.join(__dirname, 'tokens.json');
const SITES = [
  { key: 'anyrouter', origin: 'https://anyrouter.top', uid: 161762, login: 'https://anyrouter.top/login', check: 'https://anyrouter.top/console', outRe: /login|signin|\/auth/i },
  { key: 'muyuan', origin: 'https://muyuan.do', uid: 17627, login: 'https://muyuan.do/login', check: 'https://muyuan.do/console', outRe: /login|expired/i },
  { key: 'lyclaude', origin: 'https://free.lyclaude.site', uid: '', login: 'https://free.lyclaude.site/', check: 'https://free.lyclaude.site/console', outRe: /login|signin|\/auth/i },
  { key: 'ai1692958', origin: 'https://ai.1692958.xyz', uid: '', login: 'https://ai.1692958.xyz/login', check: 'https://ai.1692958.xyz/console/personal', outRe: /login|signin|\/auth/i },
  { key: 'gyapi', origin: 'https://gyapi.zxiaoruan.cn', uid: '', login: 'https://gyapi.zxiaoruan.cn/sign-in', check: 'https://gyapi.zxiaoruan.cn/profile', outRe: /sign-in|login/i },
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitCDP(ms) {
  const http = require('http'); const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise(res => { const req = http.get(`http://127.0.0.1:${PORT}/json/version`, r => { r.resume(); res(r.statusCode === 200); }); req.on('error', () => res(false)); req.setTimeout(1500, () => { req.destroy(); res(false); }); });
    if (ok) return true; await sleep(800);
  }
  return false;
}

(async () => {
  spawnSync('taskkill', ['/F', '/IM', 'msedge.exe']);
  await sleep(2500);
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${UDD}`, '--restore-last-session', '--no-first-run'], { detached: true, stdio: 'ignore' });
  child.unref();
  if (!await waitCDP(20000)) { console.log('CDP_FAIL'); process.exit(2); }
  console.log('CDP_READY');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0] || (await browser.newContext());

  for (const s of SITES) {
    const loginPage = await ctx.newPage();
    try { await loginPage.goto(s.login || s.check, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) {}
  }
  console.log('TABS_OPEN please log in to any pending sites, including lyclaude');

  const tokens = {}; const state = { cookies: [], origins: [] }; const cookieMap = new Map(); const done = {};
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Object.keys(done).length < SITES.length && Date.now() < deadline) {
    for (const s of SITES) {
      if (done[s.key]) continue;
      const tp = await ctx.newPage();
      try {
        await tp.goto(s.check, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await tp.waitForTimeout(1500);
        if (!s.outRe.test(tp.url())) {
          const uid = (await tp.evaluate(() => { try { return JSON.parse(localStorage.getItem('user') || '{}').id || ''; } catch (e) { return ''; } })) || s.uid;
          const tk = await tp.evaluate(async (a) => { try { const r = await fetch(a.origin + '/api/user/token', { credentials: 'include', headers: { 'New-Api-User': String(a.uid) } }); const j = await r.json(); return j && j.data; } catch (e) { return null; } }, { origin: s.origin, uid });
          tokens[s.key] = { uid, token: tk };
          for (const c of await ctx.cookies(s.origin)) cookieMap.set(`${c.name}|${c.domain}|${c.path}`, c);
          const ls = await tp.evaluate(() => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } } catch (e) {} return o; });
          state.origins = state.origins.filter(o => o.origin !== s.origin).concat([{ origin: s.origin, localStorage: Object.entries(ls).map(([name, value]) => ({ name, value })) }]);
          done[s.key] = { uid, token: !!tk };
          console.log(`GOT ${s.key} token=${tk ? 'yes' : 'no'} uid=${uid}`);
        }
      } catch (e) {}
      await tp.close().catch(() => {});
    }
    state.cookies = Array.from(cookieMap.values());
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    fs.writeFileSync(TOKENS, JSON.stringify(tokens, null, 2));
    if (Object.keys(done).length < SITES.length) await sleep(5000);
  }
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  fs.writeFileSync(TOKENS, JSON.stringify(tokens, null, 2));
  console.log('ALL_DONE ' + JSON.stringify(done));
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
