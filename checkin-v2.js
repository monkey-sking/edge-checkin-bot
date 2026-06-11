// 配置化自动签到脚本
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const STATE = path.join(__dirname, 'state.json');
const TOKENS = path.join(__dirname, 'tokens.json');
const CONFIG = path.join(__dirname, 'sites-config.json');
const LOG = path.join(__dirname, 'checkin-log.txt');

function log(line) {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
  const s = `[${ts}] ${line}`;
  console.log(s);
  try { fs.appendFileSync(LOG, s + '\n'); } catch (e) {}
}

async function checkinAPI(page, site, token) {
  const res = await page.evaluate(async (args) => {
    try {
      const headers = { 'Authorization': args.token, 'New-Api-User': String(args.uid), 'Content-Type': 'application/json' };
      const before = await fetch(args.origin + '/api/user/self', { headers });
      let beforeData = {};
      try { beforeData = JSON.parse(await before.text()); } catch (e) {}
      const quotaBefore = beforeData.data && beforeData.data.quota;

      const r = await fetch(args.origin + args.apiPath, { method: 'POST', headers });
      let j = {};
      try { j = JSON.parse(await r.text()); } catch (e) {}

      await new Promise(resolve => setTimeout(resolve, 1000));
      const after = await fetch(args.origin + '/api/user/self', { headers });
      let afterData = {};
      try { afterData = JSON.parse(await after.text()); } catch (e) {}
      const quotaAfter = afterData.data && afterData.data.quota;

      return { status: r.status, success: j.success, message: j.message, quotaBefore, quotaAfter };
    } catch (e) {
      return { netErr: e.message };
    }
  }, { origin: site.origin, apiPath: site.apiPath, token: token.token, uid: token.uid });

  return res;
}

async function checkinVisit(page, site, token) {
  const resBefore = await page.evaluate(async (args) => {
    try {
      const r = await fetch(args.origin + '/api/user/self', { headers: { 'Authorization': args.token, 'New-Api-User': String(args.uid) } });
      let j = {};
      try { j = JSON.parse(await r.text()); } catch (e) {}
      return { status: r.status, quota: j.data && j.data.quota };
    } catch (e) {
      return { netErr: e.message };
    }
  }, { origin: site.origin, token: token.token, uid: token.uid });

  await page.goto(site.visitUrl || site.origin, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  const res = await page.evaluate(async (args) => {
    try {
      const r = await fetch(args.origin + '/api/user/self', { headers: { 'Authorization': args.token, 'New-Api-User': String(args.uid) } });
      let j = {};
      try { j = JSON.parse(await r.text()); } catch (e) {}
      return { status: r.status, quota: j.data && j.data.quota };
    } catch (e) {
      return { netErr: e.message };
    }
  }, { origin: site.origin, token: token.token, uid: token.uid });

  return { ...res, quotaBefore: resBefore.quota };
}

(async () => {
  if (!fs.existsSync(STATE) || !fs.existsSync(TOKENS)) {
    log('FATAL: 缺少 state.json 或 tokens.json，请先运行 relogin-gettoken.js');
    process.exit(1);
  }

  const sites = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ storageState: STATE });

  let ok = 0, bad = 0;

  for (const site of sites) {
    const token = tokens[site.key];
    const page = await ctx.newPage();

    try {
      if (!token || !token.token) {
        log(`${site.name}: token missing, run relogin-gettoken.js after logging in to ${site.origin}`);
        bad++;
        await page.close().catch(() => {});
        continue;
      }

      await page.goto(site.checkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1500);

      let res;
      if (site.checkinType === 'api') {
        res = await checkinAPI(page, site, token);
      } else if (site.checkinType === 'visit') {
        res = await checkinVisit(page, site, token);
      }

      if (res.netErr) {
        log(`${site.name}: ❌ 网络异常 ${res.netErr}`);
        bad++;
      } else if (res.success === true || (site.checkinType === 'visit' && res.status === 200)) {
        let msg = `${site.name}: ✅ ${site.checkinType === 'visit' ? '已访问首页（自动发放）' : '签到成功'}`;
        if (res.quotaBefore !== undefined && res.quotaAfter !== undefined) {
          const change = res.quotaAfter - res.quotaBefore;
          msg += ` | 余额: $${(res.quotaBefore / 500000).toFixed(2)} → $${(res.quotaAfter / 500000).toFixed(2)}`;
          if (change > 0) msg += ` (+$${(change / 500000).toFixed(2)})`;
          else if (change === 0 && site.checkinType === 'visit') msg += ` (无变化)`;
        } else if (res.quota !== undefined) {
          msg += ` | 当前余额: $${(res.quota / 500000).toFixed(2)}`;
        }
        if (res.message) msg += ` | ${res.message}`;
        log(msg);
        ok++;
      } else if (res.success === false && /already|今日|已签到|已簽到|signed/i.test(res.message || '')) {
        let msg = `${site.name}: ✅ 今日已签到`;
        if (res.quotaBefore !== undefined) msg += ` | 当前余额: $${(res.quotaBefore / 500000).toFixed(2)}`;
        log(msg);
        ok++;
      } else if (res.status === 401) {
        log(`${site.name}: 🔑 令牌失效，请重新运行 relogin-gettoken.js`);
        bad++;
      } else {
        log(`${site.name}: ⚠️ status=${res.status} success=${res.success} msg=${res.message || ''}`);
        bad++;
      }
    } catch (e) {
      log(`${site.name}: ❌ 异常 ${e.message}`);
      bad++;
    }

    await page.close().catch(() => {});
  }

  await browser.close();
  log(`本次完成：成功 ${ok}/${sites.length}` + (bad ? `，${bad} 项需关注` : ''));
  process.exit(bad ? 1 : 0);
})().catch(e => { log('FATAL ' + e.message); process.exit(1); });
