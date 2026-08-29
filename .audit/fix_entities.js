/* ⚠️ 已执行完毕的一次性数据修复脚本，重复运行前请先想清楚。
 *
 * 本脚本是幂等的：数据里没有残留实体时重跑不会产生任何改动，可以安全用来"复查"。
 * 但它是直接改写 objective-questions.js 源文件的，跑之前务必确认工作区干净
 * （git status 无未提交改动），否则改动混在一起不好回滚。
 *
 * 修复：objective-questions.js 中残留的 HTML 实体，使其在页面上正常显示。
   背景：渲染走 esc()，会把 & 转成 &amp;，导致数据里的 &quot; 原样显示成 &quot;。
   做法：在【原始文本】上反复替换直到稳定（数据里有 &amp;quot; 双重编码，单遍会留下残余）。
        &quot; -> \"   （JSON 字符串内的双引号必须转义）
        &#039; -> '
        &amp;  -> &
   替换后用 VM 重新加载校验 JSON 合法性 + 题数一致 + 实体清零。 */
const fs = require('fs');
const vm = require('vm');
const F = 'objective-questions.js';

const before = fs.readFileSync(F, 'utf8');

const ENT_RE = /&(quot|#039|#39|amp);/g;
function decodeOnce(s) {
  return s.replace(ENT_RE, (m, name) => {
    if (name === 'quot') return '\\"';   // JSON 字符串内的双引号必须转义
    if (name === '#039' || name === '#39') return "'";
    if (name === 'amp') return '&';
    return m;
  });
}

let after = before;
let rounds = 0;
for (let i = 0; i < 5; i++) {
  const next = decodeOnce(after);
  if (next === after) break;
  rounds++;
  after = next;
}

if (before === after) {
  console.log('没有需要替换的实体，未修改文件。');
  process.exit(0);
}

const cnt = re => (before.match(re) || []).length;
console.log('原始文本实体统计:');
console.log(`  &quot;     : ${cnt(/&quot;/g)}`);
console.log(`  &#039;     : ${cnt(/&#039;/g)}`);
console.log(`  &amp;      : ${cnt(/&amp;/g)}`);
console.log(`  &amp;quot; : ${cnt(/&amp;quot;/g)}  (双重编码)`);
console.log(`  迭代轮数   : ${rounds}`);

const tmp = F + '.tmp';
fs.writeFileSync(tmp, after, 'utf8');

function tryLoad(file) {
  const s = { window: {}, console };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(file, 'utf8'), s, { filename: file });
  return s.window.OBJECTIVE_QUESTIONS || [];
}

const qBefore = tryLoad(F);
let qAfter;
try {
  qAfter = tryLoad(tmp);
} catch (e) {
  fs.unlinkSync(tmp);
  console.error('❌ 替换后 JSON 非法，已放弃修改:', e.message);
  process.exit(1);
}

if (qAfter.length !== qBefore.length) {
  fs.unlinkSync(tmp);
  console.error(`❌ 题数不一致 (${qBefore.length} -> ${qAfter.length})，已放弃修改`);
  process.exit(1);
}

// 完全解码函数（用于比对：修改前的值解码后应等于修改后的值）
function dec(s) {
  let v = String(s == null ? '' : s);
  for (let i = 0; i < 5; i++) {
    const n = v.replace(/&(quot|#039|#39|amp);/g, (m, name) =>
      name === 'quot' ? '"' : (name === 'amp' ? '&' : "'"));
    if (n === v) break;
    v = n;
  }
  return v;
}

const ENT = /&(?:quot|amp|lt|gt|nbsp|#039|#39|#\d+);/g;
let diffOther = 0, entLeft = 0;

for (let i = 0; i < qBefore.length; i++) {
  const a = qBefore[i], b = qAfter[i];
  if (a.id !== b.id) { diffOther++; console.log(`  ⚠ 第${i}条 id 变化`); continue; }
  const fields = ['stem', 'answerText', 'explanation'];
  fields.forEach(f => {
    if (dec(a[f]) !== String(b[f] == null ? '' : b[f])) {
      diffOther++;
      console.log(`  ⚠ ${a.id}.${f} 差异\n     旧: ${dec(a[f]).slice(0, 80)}\n     新: ${String(b[f]).slice(0, 80)}`);
    }
  });
  const oa = a.options || [], ob = b.options || [];
  if (oa.length !== ob.length) { diffOther++; continue; }
  oa.forEach((o, j) => {
    if (dec(o.text) !== String(ob[j].text == null ? '' : ob[j].text)) {
      diffOther++;
      console.log(`  ⚠ ${a.id}.opt${o.letter} 差异`);
    }
  });
  [b.stem, b.answerText, ...(b.options || []).map(o => o.text)].forEach(v => {
    const m = String(v == null ? '' : v).match(ENT);
    if (m) entLeft += m.length;
  });
}

console.log('\n校验结果:');
console.log(`  题数: ${qAfter.length}（与修改前一致）`);
console.log(`  非实体差异: ${diffOther}`);
console.log(`  残留实体: ${entLeft}`);

if (diffOther === 0 && entLeft === 0) {
  fs.renameSync(tmp, F);
  console.log('\n✅ 校验通过，已写入 objective-questions.js');
} else {
  fs.unlinkSync(tmp);
  console.log('\n❌ 校验未通过，未修改原文件');
  process.exit(1);
}
