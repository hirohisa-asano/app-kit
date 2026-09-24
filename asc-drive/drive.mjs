// CDP経由で起動済みChromeを1コマンドずつ操作するドライバ
// usage: node drive.mjs shot [path]        … アクティブページをスクリーンショット
//        node drive.mjs goto <url>
//        node drive.mjs click <text>       … その表示テキストを持つ要素をクリック
//        node drive.mjs fill <selector> <text>
//        node drive.mjs eval <js>          … page コンテキストで評価して結果を出力
//        node drive.mjs url               … 現在のURLとタイトル
import { chromium } from 'playwright-core';

const [cmd, ...args] = process.argv.slice(2);
const browser = await chromium.connectOverCDP(process.env.CDP_URL ?? 'http://localhost:9333');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const page = pages[pages.length - 1];

try {
  switch (cmd) {
    case 'shot': {
      const path = args[0] ?? process.env.ASC_SHOT ?? './shot.png';
      await page.screenshot({ path });
      console.log('shot:', path, '|', page.url());
      break;
    }
    case 'goto':
      await page.goto(args[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log('at:', page.url());
      break;
    case 'click': {
      const t = args.join(' ');
      await page.getByText(t, { exact: false }).first().click({ timeout: 8000 });
      console.log('clicked:', t);
      break;
    }
    case 'fill':
      await page.locator(args[0]).fill(args.slice(1).join(' '), { timeout: 8000 });
      console.log('filled');
      break;
    case 'eval': {
      const r = await page.evaluate(args.join(' '));
      console.log(JSON.stringify(r)?.slice(0, 3000));
      break;
    }
    case 'url':
      console.log(page.url(), '|', await page.title());
      break;
    case 'upload': {
      // args[0]=file input selector (or 'auto' for first file input), rest=paths
      const sel = args[0] === 'auto' ? 'input[type=file]' : args[0];
      await page.locator(sel).first().setInputFiles(args.slice(1), { timeout: 10000 });
      console.log('uploaded', args.length - 1, 'files');
      break;
    }
    case 'fillfile': {
      const fs = await import('fs');
      const content = fs.readFileSync(args[1], 'utf8').replace(/\n$/, '');
      await page.locator(args[0]).fill(content, { timeout: 8000 });
      console.log('filled from file', content.length, 'chars');
      break;
    }
    case 'select':
      await page.locator(args[0]).selectOption(args[1], { timeout: 8000 });
      console.log('selected', args[1]);
      break;
    case 'front': {
      // URLに部分一致するタブを前面化
      const target = args[0];
      const all = ctx.pages();
      const p2 = target ? all.find((pg) => pg.url().includes(target)) : page;
      if (p2) {
        await p2.bringToFront();
        console.log('front:', p2.url());
      } else console.log('no tab matching', target);
      break;
    }
    case 'clickxy':
      await page.mouse.click(Number(args[0]), Number(args[1]));
      console.log('clicked at', args[0], args[1]);
      break;
    default:
      console.log('unknown cmd');
  }
} finally {
  await browser.close(); // CDP接続のみ切断 (Chrome本体は生き続ける)
}
