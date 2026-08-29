/* 深度明细检查（check.js 的补充，只读、可安全重跑）
 *
 *   D2. PDF 映射精确核对：断链 / 孤儿 / 有条目无 PDF / 幽灵键
 *   F.  特殊字符风险：数据里含引号/反斜杠/换行，会不会截断内联 onclick 属性
 *   G.  政策库重复条目明细：区分「同分类真重复」与「跨分类双归属」
 *   H.  题库重复题干明细：按去空格完整题干比对，并看答案是否一致
 *   I.  简答题参考答案过短（< 60 字）清单
 *
 * check.js 给结论和计数，本脚本给逐条明细 —— 排查时两个配合看。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = process.cwd();

function load(f) {
  const s = { window: {}, console };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(f, 'utf8'), s, { filename: f });
  return s.window;
}
const w = { ...load('policy-library-data.js'), ...load('policy-dates.js'), ...load('objective-questions.js') };
const POL = w.POLICY_DATA || [], MAP = w.POLICY_PDF_MAP || {}, Q = w.OBJECTIVE_QUESTIONS || [], D = w.POLICY_DATES || {};
const key = p => (p.doc === undefined ? '' : p.doc) + '|' + p.title;

console.log('='.repeat(70) + '\nD2. PDF 映射精确核对\n' + '='.repeat(70));
const vals = Object.values(MAP);
const filesExist = new Set(fs.readdirSync(path.join(ROOT, 'policies', 'library')).filter(f => f.endsWith('.pdf')).map(f => 'policies/library/' + f));
const broken = vals.filter(v => !filesExist.has(v));
console.log(`  映射条数: ${Object.keys(MAP).length} | 指向不存在文件: ${broken.length}`);
broken.forEach(v => console.log(`    ✗ ${v}`));

const used = new Set(vals);
const orphans = [...filesExist].filter(f => !used.has(f));
console.log(`  磁盘 PDF: ${filesExist.size} | 未被任何映射引用(孤儿): ${orphans.length}`);
console.log(`    孤儿文件: ${orphans.map(f => f.split('/').pop()).join(', ')}`);

/* 政策条目是否有 PDF */
const noPdf = POL.filter(p => !MAP[key(p)]);
console.log(`  有条目无 PDF 映射: ${noPdf.length} / ${POL.length}`);
noPdf.forEach(p => console.log(`    - ${key(p)}`));

/* 映射键在 POLICY_DATA 里找不到对应条目 */
const polKeys = new Set(POL.map(key));
const ghost = Object.keys(MAP).filter(k => !polKeys.has(k));
console.log(`  映射键无对应条目(幽灵键): ${ghost.length}`);
ghost.forEach(k => console.log(`    - ${k}`));

console.log('\n' + '='.repeat(70) + '\nF. 特殊字符风险（esc 只转义 & < >，不转义引号）\n' + '='.repeat(70));
function scanQuotes(name, arr, getters) {
  let sq = 0, dq = 0, bs = 0, nl = 0;
  const samples = { "'": [], '"': [], '\\': [], '\n': [] };
  arr.forEach((item, i) => {
    getters.forEach(g => {
      const s = g(item);
      if (typeof s !== 'string') return;
      if (s.includes("'")) { sq++; if (samples["'"].length < 5) samples["'"].push(`#${i} ${g.name||''}: ${s.slice(0, 70)}`); }
      if (s.includes('"')) { dq++; if (samples['"'].length < 5) samples['"'].push(`#${i}: ${s.slice(0, 70)}`); }
      if (s.includes('\\')) { bs++; if (samples['\\'].length < 5) samples['\\'].push(`#${i}: ${s.slice(0, 70)}`); }
      if (/[\r\n]/.test(s)) { nl++; if (samples['\n'].length < 3) samples['\n'].push(`#${i}: ${s.slice(0, 70)}`); }
    });
  });
  console.log(`\n  [${name}] 单引号:${sq} 双引号:${dq} 反斜杠:${bs} 换行:${nl}`);
  Object.entries(samples).forEach(([ch, list]) => list.forEach(x => console.log(`    含${ch} → ${x}`)));
  return { sq, dq, bs, nl };
}
scanQuotes('政策 key (doc|title)', POL, [p => key(p)]);
scanQuotes('政策 title', POL, [p => p.title]);
scanQuotes('政策 doc', POL, [p => p.doc]);
scanQuotes('政策 url', POL, [p => p.url]);
scanQuotes('题库 stem', Q, [q => q.stem]);
scanQuotes('题库 answerText', Q, [q => q.answerText]);
scanQuotes('题库 options', Q, [q => (q.options || []).map(o => o.text).join('|')]);

console.log('\n' + '='.repeat(70) + '\nG. 政策库重复条目明细（判断是否为跨分类双归属）\n' + '='.repeat(70));
const seen = new Map();
POL.forEach((p, i) => {
  const k = key(p);
  if (seen.has(k)) {
    const prev = POL[seen.get(k)];
    const sameCat = p.category === prev.category && (p.subcategory || '') === (prev.subcategory || '');
    console.log(`  #${seen.get(k)} 与 #${i} | ${sameCat ? '❗同分类重复(真重复)' : '✅跨分类双归属'} | ${k}`);
    console.log(`      A: ${prev.category} / ${prev.subcategory}  origin=${prev.origin}`);
    console.log(`      B: ${p.category} / ${p.subcategory}  origin=${p.origin}`);
  } else seen.set(k, i);
});

console.log('\n' + '='.repeat(70) + '\nH. 题库重复题干明细\n' + '='.repeat(70));
const st = new Map();
Q.forEach((q, i) => {
  const k = String(q.stem || '').replace(/\s+/g, '');
  if (st.has(k)) {
    const p = Q[st.get(k)];
    const sameAns = JSON.stringify(p.answer) === JSON.stringify(q.answer);
    console.log(`  ${p.id} 与 ${q.id} | type=${q.type} | 答案${sameAns ? '一致' : '❗不一致'} | ${k.slice(0, 45)}…`);
  } else st.set(k, i);
});

console.log('\n' + '='.repeat(70) + '\nI. 简答题参考答案为空/过短的\n' + '='.repeat(70));
Q.filter(q => q.type === 'short').forEach(q => {
  const len = String(q.answerText || '').replace(/\s/g, '').length;
  if (len < 60) console.log(`  ${q.id} (${len}字): ${String(q.answerText || '').slice(0, 80)}`);
});
