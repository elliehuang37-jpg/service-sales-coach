// 依 index.html、manifest、圖示與截圖的內容產生版本號，寫進 sw.js。
// 每次修改網頁後、commit 之前執行：node scripts/stamp-sw.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const list = dir => fs.readdirSync(path.join(root, dir)).sort().map(f => dir + '/' + f);
const files = ['index.html', 'manifest.webmanifest', ...list('icons'), ...list('screenshots')];
const hash = crypto.createHash('sha256');
for (const f of files) hash.update(fs.readFileSync(path.join(root, f)));
const version = 'v-' + hash.digest('hex').slice(0, 10);

const swPath = path.join(root, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
fs.writeFileSync(swPath, sw);
console.log('sw.js version', version);
