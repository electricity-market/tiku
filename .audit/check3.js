/* 代码与数据风险检查（只读、可安全重跑）
 *
 *   J. HTML 实体会因 esc() 二次转义而原样显示
 *   K. 数学公式：含 LaTeX 的题有多少、页面是否引入了公式库
 *   L. 数据占位符残留（"此处为简答题"/"待补充"/TODO 等会显示给用户）
 *   M. localStorage 用量风险（约 5MB 配额，题库 1.3MB 整库落盘会撑爆）
 *   N. 渲染性能：innerHTML 赋值点、是否分页/虚拟滚动
 *
 * 注：K 项在引入自托管 KaTeX 后应显示"已引入"，若变回"否"说明 vendor/katex 丢了，
 *     可配合 .audit/completeness.js 一起查。
 */
const fs = require('fs');
const vm = require('vm');
function load(f) { const s = { window: {}, console }; vm.createContext(s); vm.runInContext(fs.readFileSync(f, 'utf8'), s, { filename: f }); return s.window; }
const Q = load('objective-questions.js').OBJECTIVE_QUESTIONS || [];
const html = fs.readFileSync('index.html', 'utf8');

// 复刻 esc()
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ENT = /&(?:quot|amp|lt|gt|nbsp|#039|#39|#\d+);/g;
let entQ = 0, entTotal = 0;
const samples = [];
Q.forEach(q => {
  const fields = [['stem', q.stem], ['answerText', q.answerText], ['explanation', q.explanation]];
  (q.options || []).forEach((o, i) => fields.push([`opt${o.letter || i}`, o.text]));
  let hit = false;
  fields.forEach(([n, v]) => {
    if (typeof v !== 'string') return;
    const m = v.match(ENT);
    if (m) {
      hit = true; entTotal += m.length;
      if (samples.length < 12) {
        const idx = v.search(ENT);
        samples.push(`${q.id} [${n}] …${v.slice(Math.max(0, idx - 30), idx + 40)}…`);
      }
    }
  });
  if (hit) entQ++;
});
console.log('='.repeat(70) + '\nJ. HTML 实体会原样显示（esc 二次转义）\n' + '='.repeat(70));
console.log(`  受影响题目: ${entQ} 道 / ${Q.length}`);
console.log(`  实体出现总次数: ${entTotal}`);
samples.forEach(s => console.log('   ' + s));

// LaTeX
let texQ = 0; const texSamples = [];
Q.forEach(q => {
  const blob = [q.stem, q.answerText, ...(q.options || []).map(o => o.text)].filter(Boolean).join('\u0001');
  if (/\$\$|\\alpha|\\beta|\\frac|\\pi|\\Delta|\^\{/.test(blob)) {
    texQ++;
    if (texSamples.length < 8) texSamples.push(`${q.id}: ${String(q.stem).slice(0, 90)}`);
  }
});
console.log('\n' + '='.repeat(70) + '\nK. 数学公式（页面无 MathJax/KaTeX）\n' + '='.repeat(70));
console.log(`  含 LaTeX/公式符号的题目: ${texQ} 道`);
texSamples.forEach(s => console.log('   ' + s));
console.log(`  index.html 是否引入公式库: ${/MathJax|KaTeX|katex/i.test(html) ? '是' : '❌ 否 — 公式将原样显示'}`);

// 简答题占位符
console.log('\n' + '='.repeat(70) + '\nL. 数据占位符残留（会显示给用户）\n' + '='.repeat(70));
const PH = [/此处为简答题/, /无标准答案列/, /保留题干/, /【缺少答案，请补充】/, /参考答案：\s*$/, /待补充/, /TODO/i, /无答案/];
Q.forEach(q => {
  const blob = [q.stem, q.answerText, q.explanation, ...(q.options || []).map(o => o.text)].filter(Boolean).join(' ');
  PH.forEach(re => { if (re.test(blob)) console.log(`  ${q.id} 命中 /${re.source}/ → ${(q.answerText || q.stem || '').slice(0, 70)}`); });
});

// localStorage 用量
console.log('\n' + '='.repeat(70) + '\nM. localStorage 用量风险\n' + '='.repeat(70));
const lsKeys = [...new Set((html.match(/localStorage\.(?:get|set|remove)Item\(\s*['"]([^'"]+)['"]/g) || [])
  .map(m => m.match(/['"]([^'"]+)['"]/)[1]))];
console.log(`  硬编码 localStorage 键: ${lsKeys.join(', ')}`);
const dyn = html.match(/localStorage\.setItem\(\s*([^,]+),/g) || [];
console.log(`  setItem 调用点: ${dyn.length} 处`);
const hasTry = /try\s*\{[^}]*localStorage\.setItem/.test(html.replace(/\n/g, ' '));
console.log(`  setItem 是否包 try/catch: ${hasTry ? '是' : '❌ 否 — 超配额(约5MB)会抛异常中断'}`);
const jsonStore = (html.match(/JSON\.stringify\([^)]*\)\s*\)?\s*;?\s*\n?\s*localStorage|localStorage\.setItem\([^,]+,\s*JSON\.stringify/g) || []).length;
console.log(`  JSON.stringify 落盘点: ${jsonStore} 处`);
console.log(`  题库原始体积: ${(fs.statSync('objective-questions.js').size / 1024 / 1024).toFixed(2)} MB（若整库落盘会撑爆配额）`);

// 渲染性能
console.log('\n' + '='.repeat(70) + '\nN. 渲染性能风险\n' + '='.repeat(70));
const inner = (html.match(/\.innerHTML\s*=/g) || []).length;
console.log(`  innerHTML 赋值点: ${inner} 处`);
const forEachHtml = (html.match(/forEach\(function[^{]*\{[\s\S]{0,200}html \+=/g) || []).length;
console.log(`  forEach 内字符串拼接渲染: ${forEachHtml} 处`);
console.log(`  是否用 DocumentFragment / 虚拟滚动: ${/DocumentFragment|createDocumentFragment|virtual|IntersectionObserver/.test(html) ? '是' : '❌ 否'}`);
console.log(`  是否有分页/限流渲染: ${/pageSize|perPage|slice\(0,\s*\d+\)|limit\s*\d+/i.test(html) ? '是' : '⚠️ 未见明确分页'}`);
