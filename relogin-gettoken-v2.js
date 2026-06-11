// 配置化登录和token获取脚本
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { chromium } = require('playwright-core');

const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const UDD = 'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\Edge\\User Data';
const PORT = 9222;
const STATE = path.join(__dirname, 'state.json');
const TOKENS = path.join(__dirname, 'tokens.json');
const CONFIG = path.join(__dirname, 'sites-config.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitCDP(ms) {
  const http = require('http');
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise(res => {
      const req = http.get(`http://127.0.0.1:${PORT}/json/version`, r => { r.resume(); res(r.statusCode === 200); });
      req.on('error', () => res(false));
      req.setTimeout(1500, () => { req.destroy(); res(false); });
    });
    if (ok) return true;
    await sleep(800);
  }
  return false;
}

(async () => {
  const sites = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

  spawnSync('taskkill', ['/F', '/IM', 'msedge.exe']);
  await sleep(2500);
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${UDD}`, '--restore-last-session', '--no-first-run'], { detached: true, stdio: 'ignore' });
  child.unref();

  if (!await waitCDP(20000)) {
    console.log('CDP_FAIL');
    process.exit(2);
  }
  console.log('CDP_READY');

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0] || (await browser.newContext());

  for (const site of sites) {
    const loginPage = await ctx.newPage();
    try {
      await loginPage.goto(site.loginUrl || site.checkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {}
  }
  console.log('TABS_OPEN please log in to any pending sites');

  const tokens = {};
  const state = { cookies: [], origins: [] };
  const cookieMap = new Map();
  const done = {};
  const deadline = Date.now() + 15 * 60 * 1000;

  while (Object.keys(done).length < sites.length && Date.now() < deadline) {
    for (const site of sites) {
      if (done[site.key]) continue;

      const tp = await ctx.newPage();
      try {
        await tp.goto(site.checkUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await tp.waitForTimeout(2000);

        const outRe = /login|signin|sign-in|\/auth/i;
        if (!outRe.test(tp.url())) {
          const uid = (await tp.evaluate(() => {
            try {
              return JSON.parse(localStorage.getItem('user') || '{}').id || '';
            } catch (e) {
              return '';
            }
          })) || site.uid;

          const tk = await tp.evaluate(async (args) => {
            try {
              const r = await fetch(args.origin + '/api/user/token', {
                credentials: 'include',
                headers: { 'New-Api-User': String(args.uid) }
              });
              const j = await r.json();
              return j && j.data;
            } catch (e) {
              return null;
            }
          }, { origin: site.origin, uid });

          tokens[site.key] = { uid, token: tk };

          for (const c of await ctx.cookies(site.origin)) {
            cookieMap.set(`${c.name}|${c.domain}|${c.path}`, c);
          }

          const ls = await tp.evaluate(() => {
            const o = {};
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                o[k] = localStorage.getItem(k);
              }
            } catch (e) {}
            return o;
          });

          state.origins = state.origins.filter(o => o.origin !== site.origin).concat([{
            origin: site.origin,
            localStorage: Object.entries(ls).map(([name, value]) => ({ name, value }))
          }]);

          done[site.key] = { uid, token: !!tk };
          console.log(`GOT ${site.key} (${site.name}) token=${tk ? 'yes' : 'no'} uid=${uid}`);
        }
      } catch (e) {}
      await tp.close().catch(() => {});
    }

    state.cookies = Array.from(cookieMap.values());
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    fs.writeFileSync(TOKENS, JSON.stringify(tokens, null, 2));

    if (Object.keys(done).length < sites.length) await sleep(15000);
  }

  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  fs.writeFileSync(TOKENS, JSON.stringify(tokens, null, 2));
  console.log('ALL_DONE ' + JSON.stringify(done));
  process.exit(0);
})().catch(e => {
  console.error('FATAL', e.message);
  process.exit(1);
});
