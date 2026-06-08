// 验证：两站 session 现状 + 能否用现有登录态生成长期 access token（new-api: GET /api/user/token）。
const path = require('path');
const { chromium } = require('playwright-core');
const SITES = [
  { key: 'anyrouter', origin: 'https://anyrouter.top', uid: 161762 },
  { key: 'muyuan', origin: 'https://muyuan.do', uid: 17627 },
];
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ storageState: path.join(__dirname, 'state.json') });
  const out = [];
  for (const s of SITES) {
    const p = await ctx.newPage();
    const r = { key: s.key };
    try {
      await p.goto(s.origin + '/console', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(1500);
      r.url = p.url();
      r.probe = await p.evaluate(async (a) => {
        let uid = a.uid; try { const u = JSON.parse(localStorage.getItem('user') || '{}'); if (u.id) uid = u.id; } catch (e) {}
        const H = { 'New-Api-User': String(uid) };
        const self = await fetch(a.origin + '/api/user/self', { credentials: 'include', headers: H }).then(async r => ({ s: r.status, b: (await r.text()).slice(0, 90) })).catch(e => ({ err: e.message }));
        const tokenGen = await fetch(a.origin + '/api/user/token', { credentials: 'include', headers: H }).then(async r => ({ s: r.status, b: (await r.text()).slice(0, 140) })).catch(e => ({ err: e.message }));
        return { uid, self, tokenGen };
      }, { origin: s.origin, uid: s.uid });
    } catch (e) { r.error = e.message; }
    await p.close().catch(() => {});
    out.push(r);
  }
  await b.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
