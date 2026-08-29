/* 仓库自包含性自检（防「运行时依赖漏入库」复发）
 *
 * 背景：2026-08-29 发现 vendor/katex/（23 个文件）引入后只 git add 了 index.html，
 * 资源目录本身一直是未跟踪状态 —— 仓库不自包含，换机 clone 后公式会全部退化成纯文本。
 *
 * 本脚本检查三类问题：
 *   A. index.html 引用的本地资源：文件不存在（断链） / 未纳入 git（漏 add）
 *   B. 工作区里未跟踪的文件，按目录聚合（可能又是某个漏入库的依赖目录）
 *   C. CSS 里 url(...) 引用的字体/图片：文件不存在
 *
 * 用法：node .audit/completeness.js
 * 退出码 0 = 全部通过；非 0 = 有问题需要处理。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

/* 有意不入库的目录：出现在这里的未跟踪文件不算问题。
   改项目结构时同步维护这份白名单。 */
const IGNORE_DIRS = ['.git', '.audit', '.workbuddy', 'node_modules'];

const problems = [];
const notes = [];

// ---------- 工具 ----------
/* 一律用 -z（NUL 分隔）：git 给含非 ASCII 的路径加引号和转义，
   按 \n 切会把 `".audit/xxx"` 拆出带引号的伪目录名，导致白名单失效。 */
function gitList(args) {
  return execSync(`git ls-files -z ${args}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean);
}

function gitTracked() {
  try {
    return new Set(gitList(''));
  } catch (e) {
    problems.push('无法执行 git ls-files（当前目录不是 git 仓库？）：' + e.message);
    return new Set();
  }
}

function stripCache(p) {
  return p.split('?')[0].split('#')[0];
}

// ---------- A. index.html 引用的本地资源 ----------
const tracked = gitTracked();
const html = fs.readFileSync('index.html', 'utf8');

// 只取字面量路径：过滤掉 ' + xxx + ' 这类模板拼接和 javascript: 伪协议
const refs = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const raw = m[1];
  if (/^https?:\/\//.test(raw)) continue;   // 外链，不归本仓库管
  if (/^[a-z]+:/i.test(raw)) continue;      // javascript: / data: / mailto:
  if (raw.includes('+')) continue;          // 模板拼接，静态扫不出来
  refs.add(stripCache(raw));
}

for (const r of [...refs].sort()) {
  if (!fs.existsSync(r)) {
    problems.push(`[A-断链] index.html 引用了 ${r}，但文件不存在`);
    continue;
  }
  if (!tracked.has(r.replace(/\\/g, '/'))) {
    problems.push(`[A-漏入库] index.html 引用了 ${r}，文件在但未 git add —— 换机 clone 会 404`);
  } else {
    notes.push(`[A-OK] ${r} 已入库 (${fs.statSync(r).size} 字节)`);
  }
}

// ---------- B. 未跟踪文件（按目录聚合）----------
let untracked = [];
try {
  untracked = gitList('--others --exclude-standard');
} catch (e) { /* gitTracked 已报过错 */ }

const byDir = new Map();
for (const f of untracked) {
  const top = f.split(/[\\/]/)[0];
  if (IGNORE_DIRS.includes(top)) continue;
  if (!byDir.has(top)) byDir.set(top, []);
  byDir.get(top).push(f);
}

for (const [dir, files] of [...byDir.entries()].sort()) {
  let size = 0;
  for (const f of files) { try { size += fs.statSync(f).size; } catch (e) {} }
  const kb = (size / 1024).toFixed(0);
  // 有 index.html 引用到它的目录 = 运行时依赖，必须入库
  const isRuntime = [...refs].some(r => r.startsWith(dir + '/'));
  if (isRuntime) {
    problems.push(`[B-漏入库] ${dir}/ 有 ${files.length} 个未跟踪文件（${kb} KB）` +
      `，且被 index.html 引用 —— 这是运行时依赖，必须 git add`);
  } else {
    notes.push(`[B-提示] ${dir}/ 有 ${files.length} 个未跟踪文件（${kb} KB），未被页面引用`);
  }
}

// ---------- C. CSS 内 url(...) 引用的资源 ----------
const cssFiles = ['vendor/katex/katex.min.css'].filter(f => fs.existsSync(f));
for (const css of cssFiles) {
  const base = path.dirname(css);
  const text = fs.readFileSync(css, 'utf8');
  const urls = new Set();
  for (const m of text.matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)/g)) {
    const u = m[1];
    if (/^(https?:|data:)/i.test(u)) continue;
    urls.add(u);
  }
  /* @font-face 通常给同一字体列多种格式（woff2/woff/ttf）供浏览器按顺序 fallback。
     本项目为控体积只保留 woff2，因此 woff/ttf 缺失是预期的，不算断链。
     判定标准：按「去扩展名的文件名」分组，同一字体只要有任意一种格式存在即通过。 */
  const groups = new Map();
  for (const u of urls) {
    const p = path.posix.join(base, u.split('?')[0]);
    const key = p.replace(/\.[a-z0-9]+$/i, '');
    if (!groups.has(key)) groups.set(key, { exist: false, missing: [] });
    const g = groups.get(key);
    if (fs.existsSync(p)) g.exist = true; else g.missing.push(u);
  }
  let bad = 0, fallback = 0;
  for (const [key, g] of groups) {
    if (!g.exist) {
      bad++;
      if (bad <= 3) problems.push(`[C-断链] ${css} 引用的字体 ${path.basename(key)} 所有格式均不存在`);
    } else if (g.missing.length) {
      fallback += g.missing.length;   // 有替代格式，正常降级
    }
  }
  notes.push(`[C-OK] ${css} 内 ${groups.size} 个字体，缺失 ${bad} 个` +
    (fallback ? `（另有 ${fallback} 个未保留的格式，浏览器自动 fallback，正常）` : ''));
}

// ---------- 输出 ----------
console.log('仓库自包含性自检');
console.log('='.repeat(72));
for (const n of notes) console.log('  ' + n);
console.log('');
if (problems.length === 0) {
  console.log('✅ 通过：页面引用的资源全部存在且已入库，无遗漏的运行时依赖');
  console.log('   仓库自包含，git clone 后可直接运行。');
  process.exit(0);
} else {
  console.log(`❌ 发现 ${problems.length} 个问题：`);
  for (const p of problems) console.log('  ' + p);
  console.log('');
  console.log('修复：git add <上面列出的路径>');
  process.exit(1);
}
