// 连接调试模式 Edge（真实资料），导出三站 cookie + localStorage 到 state.json，
// 顺便截图并扫描“签到”类控件，供后续构建签到脚本。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const TARGETS = [
  { key: 'freemodel', url: 'https://freemodel.dev/dashboard' },
  { key: 'anyrouter', url: 'https://anyrouter.top/console' },
  { key: 'muyuan',    url: 'https://muyuan.do/console/topup' },
];
const CHECKIN_SRC = '(签到|打卡|每日|领取|check[\\s-]?in|sign[\\s-]?in|daily|claim|reward)';

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0] || (await browser.newContext());

  const cookieMap = new Map();
  const origins = [];
  const report = [];

  for (const t of TARGETS) {
    const entry = { key: t.key, target: t.url };
    let page;
    try {
      page = await context.newPage();
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);
      entry.finalUrl = page.url();
      entry.title = await page.title();
      entry.loggedOut = /login|signin|sign-in|\/auth/i.test(page.url());

      const origin = new URL(t.url).origin;
      const cookies = await context.cookies(origin);
      entry.cookieCount = cookies.length;
      for (const c of cookies) cookieMap.set(`${c.name}|${c.domain}|${c.path}`, c);

      const ls = await page.evaluate(() => {
        const o = {};
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } } catch (e) {}
        return o;
      });
      entry.localStorageKeys = Object.keys(ls);
      origins.push({ origin, localStorage: Object.entries(ls).map(([name, value]) => ({ name, value })) });

      entry.checkinHits = await page.evaluate((reSrc) => {
        const re = new RegExp(reSrc, 'i');
        const els = Array.from(document.querySelectorAll('button, a, [role=button], .btn, .ant-btn, .semi-button, span, div'));
        const out = [];
        for (const el of els) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt && txt.length <= 24 && re.test(txt)) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) out.push({ tag: el.tagName.toLowerCase(), text: txt, id: el.id || null, cls: String(el.className || '').slice(0, 70) });
          }
        }
        const seen = new Set();
        return out.filter(h => { const k = h.tag + '|' + h.text; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
      }, CHECKIN_SRC);

      await page.screenshot({ path: path.join(__dirname, `shot-${t.key}.png`), fullPage: false }).catch(() => {});
    } catch (e) {
      entry.error = e.message;
    } finally {
      if (page) await page.close().catch(() => {});
    }
    report.push(entry);
  }

  const state = { cookies: Array.from(cookieMap.values()), origins };
  fs.writeFileSync(path.join(__dirname, 'state.json'), JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(__dirname, 'extract-report.json'), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report.map(r => ({
    key: r.key, finalUrl: r.finalUrl, loggedOut: r.loggedOut,
    cookieCount: r.cookieCount, lsKeys: (r.localStorageKeys || []).length,
    checkin: (r.checkinHits || []).map(h => h.text), error: r.error,
  })), null, 2));

  // 不要 browser.close()：那会关掉你的 Edge。仅断开 CDP。
})().catch(e => { console.error('FATAL', e); process.exit(1); });
