const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const S = process.argv[2], n = Number(process.argv[3]);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8790/mp/run.html');
  const t0 = Date.now();
  const count = await p.evaluate(([n, s]) => window.runAll(n, s), [n, Number(process.argv[4] || 1)]);
  const res = await p.evaluate(() => window.results);
  fs.writeFileSync(S + '/video/pose.json', JSON.stringify(res));
  console.log('frames', count, 'detected', res.filter(r => r.w).length, 'secs', (Date.now() - t0) / 1000);
  await b.close();
})();
