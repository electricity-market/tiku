/* 网站数据全量校验：编码 / 题库完整性 / 政策库一致性 / PDF 存在性 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.cwd();
const problems = [];
const P = (level, cat, msg) => problems.push({ level, cat, msg });

/* ---------- 0. 编码体检（字节级，绕过终端） ---------- */
function checkEncoding(file) {
  const buf = fs.readFileSync(file);
  // 1) 是否合法 UTF-8
  let bad = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b < 0x80) continue;
    let need = 0;
    if (b >= 0xc2 && b <= 0xdf) need = 1;
    else if (b >= 0xe0 && b <= 0xef) need = 2;
    else if (b >= 0xf0 && b <= 0xf4) need = 3;
    else { bad++; continue; }
    for (let k = 1; k <= need; k++) {
      if (i + k >= buf.length || (buf[i + k] & 0xc0) !== 0x80) { bad++; break; }
    }
    i += need;
  }
  // 2) 是否含 UTF-8 编码的 UTF-8（mojibake 特征：CJK 区被拆成 3 字节 Latin）
  const s = buf.toString('utf8');
  const mojibake = (s.match(/[ÂÃÄÅÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîï][€-¿]/g) || []).length;
  // 3) 替换字符 / BOM
  const ufffd = (s.match(/\uFFFD/g) || []).length;
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  console.log(`\n[编码] ${file}`);
  console.log(`  UTF-8 非法字节序列: ${bad}`);
  console.log(`  U+FFFD 替换字符: ${ufffd}`);
  console.log(`  典型乱码特征串: ${mojibake}`);
  console.log(`  BOM: ${bom ? '有' : '无'}`);
  if (bad > 0) P('严重', '编码', `${file} 存在 ${bad} 处非法 UTF-8 字节`);
  if (ufffd > 0) P('严重', '编码', `${file} 含 ${ufffd} 个 U+FFFD（编码已损坏）`);
  if (mojibake > 0) P('严重', '编码', `${file} 疑似双重编码乱码 ${mojibake} 处`);
  if (bom) P('警告', '编码', `${file} 带 UTF-8 BOM`);
  return s;
}

/* ---------- 1. 加载数据 ---------- */
function load(file) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  } catch (e) {
    P('严重', '加载', `${file} 执行失败: ${e.message}`);
    return {};
  }
  return sandbox.window;
}

console.log('='.repeat(70));
console.log('A. 编码体检');
console.log('='.repeat(70));
['index.html', 'objective-questions.js', 'policy-library-data.js', 'policy-dates.js']
  .forEach(checkEncoding);

console.log('\n' + '='.repeat(70));
console.log('B. 题库完整性（objective-questions.js）');
console.log('='.repeat(70));

const q = load('objective-questions.js').OBJECTIVE_QUESTIONS || [];
console.log(`  运行时实际题数: ${q.length}`);

const byType = {};
const idSeen = new Map();
let noId = 0, noStem = 0, noAnswer = 0, noOptions = 0;
let answerOutOfRange = 0, multiSingleAnswer = 0, judgeBadAnswer = 0;
let emptyExplanation = 0, noAnswerText = 0;
const optCountByType = {};
const dupStems = new Map();

q.forEach((it, i) => {
  byType[it.type] = (byType[it.type] || 0) + 1;
  if (!it.id) { noId++; if (noId <= 5) P('严重', '题库', `第 ${i} 条缺 id`); }
  else {
    if (idSeen.has(it.id)) { if (idSeen.size < 9999) P('严重', '题库', `id 重复: ${it.id}（位置 ${idSeen.get(it.id)} 与 ${i}）`); }
    else idSeen.set(it.id, i);
  }
  if (!it.stem || !String(it.stem).trim()) { noStem++; if (noStem <= 5) P('严重', '题库', `${it.id} 题干为空`); }
  const opts = it.options || [];
  if (!it.type.startsWith('short') && opts.length === 0) {
    noOptions++;
    if (noOptions <= 5) P('严重', '题库', `${it.id} 无选项`);
  }
  const key = `${it.type}|${opts.length}`;
  optCountByType[key] = (optCountByType[key] || 0) + 1;

  /* 简答题的作答内容在 reference / answerText 字段，answer 恒为空数组——
     若统一按 answer 判空，会把所有简答题误报成"无答案"。 */
  const ans = it.answer;
  if (it.type === 'short') {
    const ref = String(it.reference || it.answerText || '').trim();
    const isPlaceholder = !ref || /此处为简答题|参考答案[:：]\s*$/i.test(ref);
    if (isPlaceholder) {
      noAnswer++;
      if (noAnswer <= 5) P('严重', '题库', `${it.id} 简答题答案为空/占位符`);
    }
  } else if (ans === undefined || ans === null || (Array.isArray(ans) && ans.length === 0)) {
    noAnswer++;
    if (noAnswer <= 5) P('严重', '题库', `${it.id} 无答案`);
  } else if (Array.isArray(ans)) {
    ans.forEach(a => {
      if (typeof a === 'number' && (a < 0 || a >= opts.length)) {
        answerOutOfRange++;
        if (answerOutOfRange <= 5) P('严重', '题库', `${it.id} 答案下标 ${a} 越界（选项数 ${opts.length}）`);
      }
    });
    if (it.type === 'single' && ans.length !== 1) {
      multiSingleAnswer++;
      if (multiSingleAnswer <= 5) P('警告', '题库', `${it.id} 单选题答案有 ${ans.length} 项`);
    }
    if (it.type === 'judge') {
      const t = (it.answerText || '').toString();
      if (!/对|错|正确|错误|√|×|是|否/.test(t)) {
        judgeBadAnswer++;
        if (judgeBadAnswer <= 5) P('警告', '题库', `${it.id} 判断题答案文本异常: ${t}`);
      }
    }
  }
  if (!it.answerText) noAnswerText++;
  if (!it.explanation || !String(it.explanation).trim()) emptyExplanation++;

  if (it.stem) {
    const k = String(it.stem).replace(/\s+/g, '').slice(0, 60);
    dupStems.set(k, (dupStems.get(k) || 0) + 1);
  }
});

console.log(`  题型分布: ${JSON.stringify(byType)}`);
console.log(`  缺 id: ${noId} | 空题干: ${noStem} | 无选项: ${noOptions}`);
console.log(`  无答案: ${noAnswer} | 答案越界: ${answerOutOfRange} | 单选多答案: ${multiSingleAnswer}`);
console.log(`  判断题答案异常: ${judgeBadAnswer}`);
console.log(`  缺解析: ${emptyExplanation} / ${q.length}（${(emptyExplanation / q.length * 100).toFixed(1)}%）`);
console.log(`  缺 answerText: ${noAnswerText}`);
console.log(`  选项数组合: ${JSON.stringify(optCountByType)}`);

const dups = [...dupStems.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
console.log(`  疑似重复题干（前60字去重）: ${dups.length} 组`);
dups.slice(0, 20).forEach(([k, n]) => P('警告', '题库去重', `题干重复 ${n} 次: ${k.slice(0, 40)}…`));

/* 简答题内容长度分布 */
const shortOnes = q.filter(x => x.type === 'short' || x.type === 'essay' || x.type === 'subjective');
if (shortOnes.length) {
  const lens = shortOnes.map(x => {
    const c = x.explanation || x.answerText || '';
    return typeof c === 'string' ? c.replace(/\s/g, '').length : JSON.stringify(c).length;
  });
  lens.sort((a, b) => a - b);
  console.log(`  简答题 ${shortOnes.length} 道, 参考答案长度 中位数=${lens[Math.floor(lens.length / 2)]} 最短=${lens[0]} 最长=${lens[lens.length - 1]}`);
  const empty = shortOnes.filter((x, i) => lens[i] < 10);
  console.log(`  参考答案 <10 字的简答题: ${empty.length} 道`);
  empty.slice(0, 10).forEach(x => P('警告', '题库', `简答题 ${x.id} 参考答案过短/缺失`));
}

console.log('\n' + '='.repeat(70));
console.log('C. 政策库一致性（policy-library-data.js + policy-dates.js）');
console.log('='.repeat(70));

const pol = load('policy-library-data.js').POLICY_DATA || [];
const dates = load('policy-dates.js').POLICY_DATES || {};
console.log(`  政策条目: ${pol.length}`);
console.log(`  日期键: ${Object.keys(dates).length}`);

const polKeys = new Set(pol.map(p => `${p.doc || ''}|${p.title}`));
const dateKeys = Object.keys(dates);
const orphanDates = dateKeys.filter(k => !polKeys.has(k));
console.log(`  孤儿日期键（有日期无条目）: ${orphanDates.length}`);
orphanDates.slice(0, 30).forEach(k => P('警告', '政策库', `孤儿日期键: ${k}`));

const missingDate = pol.filter(p => !polKeys.has(`${p.doc || ''}|${p.title}`) || !dates[`${p.doc || ''}|${p.title}`]);
console.log(`  条目缺通知日期: ${missingDate.length} / ${pol.length}`);
missingDate.slice(0, 30).forEach(p => P('警告', '政策库', `缺日期: ${p.doc} | ${p.title}`));

/* 条目字段 */
let noUrl = 0, noDoc = 0, noTitle = 0;
const docSeen = new Map(), titleSeen = new Map();
pol.forEach((p, i) => {
  if (!p.url) { noUrl++; if (noUrl <= 10) P('警告', '政策库', `无 URL: ${p.doc} | ${p.title}`); }
  if (!p.doc) noDoc++;
  if (!p.title) { noTitle++; P('严重', '政策库', `第 ${i} 条无标题`); }
  const dk = `${p.doc}||${p.title}`;
  if (docSeen.has(dk)) P('警告', '政策库', `完全重复条目 #${docSeen.get(dk)}/#${i}: ${p.doc} | ${p.title}`);
  else docSeen.set(dk, i);
  const tk = p.title;
  if (titleSeen.has(tk)) P('提示', '政策库', `同名条目(不同文号?) #${titleSeen.get(tk)}/#${i}: ${tk}`);
  else titleSeen.set(tk, i);
});
console.log(`  无 URL: ${noUrl} | 无文号: ${noDoc} | 无标题: ${noTitle}`);

/* URL 唯一性 / 重复 URL */
const urlMap = new Map();
pol.forEach((p, i) => { if (p.url) { urlMap.set(p.url, (urlMap.get(p.url) || []).concat(i)); } });
const dupUrls = [...urlMap.entries()].filter(([, v]) => v.length > 1);
console.log(`  重复 URL: ${dupUrls.length} 组`);
dupUrls.forEach(([u, v]) => P('提示', '政策库', `URL 被 ${v.length} 条共用 (#${v.join(',')}): ${u}`));

/* PDF 映射 */
console.log('\n' + '='.repeat(70));
console.log('D. PDF 文件与映射');
console.log('='.repeat(70));
/* 映射表定义在 policy-library-data.js（不是 index.html）——必须直接加载，
   早先版本在 index.html 里正则找映射，会全部误报成"未找到"+107 个孤儿。 */
const pdfMap = load('policy-library-data.js').POLICY_PDF_MAP || {};
const mapEntries = Object.entries(pdfMap);
console.log(`  POLICY_PDF_MAP 映射条目: ${mapEntries.length}`);

const libDir = path.join(ROOT, 'policies', 'library');
const pdfFiles = fs.existsSync(libDir) ? fs.readdirSync(libDir).filter(f => f.endsWith('.pdf')) : [];
console.log(`  policies/library 下 PDF 数量: ${pdfFiles.length}`);

/* 1) 断链：映射指向的文件不存在 */
const brokenRefs = mapEntries.filter(([, f]) => !fs.existsSync(path.join(ROOT, f)));
console.log(`  断链（映射指向不存在的文件）: ${brokenRefs.length}`);
brokenRefs.forEach(([k, f]) => P('严重', 'PDF', `映射指向不存在的文件 ${f}  <- ${k}`));

/* 2) 幽灵键：映射键在 POLICY_DATA 里找不到对应条目 */
/* polKeys 已在 C 部分定义并复用 */
const ghostKeys = mapEntries.filter(([k]) => !polKeys.has(k));
console.log(`  幽灵键（有 PDF 映射无政策条目）: ${ghostKeys.length}`);
ghostKeys.forEach(([k]) => P('警告', 'PDF', `映射键无对应政策条目: ${k}`));

/* 3) 缺 PDF：政策条目没有对应映射 */
const noPdf = pol.filter(p => !pdfMap[`${p.doc || ''}|${p.title}`]);
console.log(`  缺 PDF 的政策条目: ${noPdf.length}`);
noPdf.forEach(p => P('提示', 'PDF', `条目无 PDF: ${p.doc || '(无文号)'} | ${p.title}`));

/* 4) 孤儿文件：存在但没被任何映射引用 */
const usedFiles = new Set(mapEntries.map(([, f]) => path.basename(f)));
const orphanPdfs = pdfFiles.filter(f => !usedFiles.has(f));
let orphanBytes = 0;
orphanPdfs.forEach(f => { try { orphanBytes += fs.statSync(path.join(libDir, f)).size; } catch (e) { /* ignore */ } });
console.log(`  孤儿 PDF（存在但未引用）: ${orphanPdfs.length} 个，合计 ${(orphanBytes / 1024 / 1024).toFixed(2)} MB`);
orphanPdfs.sort().forEach(f => {
  const kb = (() => { try { return Math.round(fs.statSync(path.join(libDir, f)).size / 1024); } catch (e) { return 0; } })();
  console.log(`      ${f}  ${kb}KB`);
});

console.log('\n' + '='.repeat(70));
console.log('E. 问题汇总');
console.log('='.repeat(70));
const order = { '严重': 0, '警告': 1, '提示': 2 };
problems.sort((a, b) => (order[a.level] - order[b.level]) || a.cat.localeCompare(b.cat));
const counts = {};
problems.forEach(p => counts[`${p.level}/${p.cat}`] = (counts[`${p.level}/${p.cat}`] || 0) + 1);
console.log('统计:', JSON.stringify(counts, null, 2));
console.log('\n明细（每类最多列 25 条）:');
const shown = {};
problems.forEach(p => {
  const k = `${p.level}/${p.cat}`;
  shown[k] = (shown[k] || 0) + 1;
  if (shown[k] <= 25) console.log(`  [${p.level}] (${p.cat}) ${p.msg}`);
  else if (shown[k] === 26) console.log(`  ... 该类剩余省略`);
});

/* 已知非缺陷：2026-08-29 全量审计已逐条核实，复跑时看到这些不必再查 */
console.log('\n' + '-'.repeat(70));
console.log('已知非缺陷（已核实，不要重复排查）:');
console.log('  · [警告/题库去重] 4 组"疑似重复题干"：按前 60 字比对命中，完整题干比对 0 重复，');
console.log('    属题型套话雷同（如"根据《电力辅助服务市场基本规则》…"），非重复题。');
console.log('  · [警告/政策库] 9 组"完全重复条目"：跨分类双归属（如 1490 号附件 1-4 同时属');
console.log('    「电价与输配电定价」和「跨省跨区」），符合预期，禁止去重。');
console.log('  · [提示/题库] 缺解析 100%：源数据无 explanation 字段，非数据损坏。');
