// 查询两站当前余额（确认签到额度到账）。quota_per_unit=500000 → 美元。
const path = require('path');
const { chromium } = require('playwright-core');
const SITES = [
  { key: 'AnyRouter', origin: 'https://anyrouter.top', uid: 161762 },
  { key: '君の公益',  origin: 'https://muyuan.do',     uid: 17627 },
  { key: 'LyClaude',  origin: 'https://free.lyclaude.site', uid: '' },
];
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ storageState: path.join(__dirname, 'state.json') });
  const out = [];
  for (const s of SITES) {
    const p = await ctx.newPage();
    try {
      await p.goto(s.origin + '/console', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(1000);
      const r = await p.evaluate(async (a) => {
        let uid = a.uid; try { uid = JSON.parse(localStorage.getItem('user') || '{}').id || a.uid; } catch (e) {}
        const res = await fetch(a.origin + '/api/user/self', { credentials: 'include', headers: { 'New-Api-User': String(uid) } });
        const j = await res.json(); const d = j.data || {};
        return { name: d.display_name || d.username, quota: d.quota, used: d.used_quota };
      }, { origin: s.origin, uid: s.uid });
      out.push({ site: s.key, name: r.name, balanceUSD: (r.quota / 500000).toFixed(2), usedUSD: (r.used / 500000).toFixed(2) });
    } catch (e) { out.push({ site: s.key, err: e.message }); }
    await p.close().catch(() => {});
  }
  await b.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
