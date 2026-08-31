/* 运行时冒烟：用 jsdom 真正把 index.html 跑起来，验证
   1) 加载无 JS 报错  2) 数据就位  3) 公式能被 KaTeX 渲染  4) 简答题答案已补齐
   5) esc() 引号已转义且不会破坏属性上下文 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { JSDOM, VirtualConsole } = require(path.join(
  'C:/Users/jiajun/.workbuddy/binaries/node/workspace/node_modules/jsdom'));

const errors = [];
const logs = [];
const vc = new VirtualConsole();
// jsdom 未实现的浏览器 API（scrollTo 等）不算页面 bug，单独归类，不计入失败
const NOT_IMPL = /Not implemented:/;
const notImpl = [];
vc.on('jsdomError', e => {
  const m = e.message || String(e);
  (NOT_IMPL.test(m) ? notImpl : errors).push('jsdomError: ' + m);
});
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => logs.push('warn: ' + a.join(' ')));

/* 必须用 http:// 而不是 file://：
   file:// 在 jsdom 里是 opaque origin，localStorage 直接抛 SecurityError，
   会打断页面初始化、连带触发一堆 TDZ 误报。起个本地静态服务才是有效测试。 */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };
const ROOT = path.resolve('.');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const full = path.join(ROOT, p);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('404'); return;
  }
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

let dom, w;
function boot(port) {
  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      JSDOM.fromURL('http://127.0.0.1:' + port + '/index.html', {
        runScripts: 'dangerously',
        resources: 'usable',
        pretendToBeVisual: true,
        virtualConsole: vc
      }).then(d => { dom = d; w = d.window; resolve(); });
    });
  });
}

const results = [];
const ok = (name, pass, extra) => results.push({ name, pass, extra: extra || '' });

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  await boot(8731);
  // 等 defer 脚本 + 外链数据脚本加载完
  for (let i = 0; i < 40; i++) {
    if (w.OBJECTIVE_QUESTIONS && w.POLICY_DATA && w.renderMathInElement) break;
    await wait(250);
  }

  // 1) 加载期无报错
  ok('页面加载无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

  // 2) 数据就位
  ok('题库加载 2596 题', w.OBJECTIVE_QUESTIONS && w.OBJECTIVE_QUESTIONS.length === 2596,
     w.OBJECTIVE_QUESTIONS ? String(w.OBJECTIVE_QUESTIONS.length) : '未加载');
  ok('政策库加载 118 条', w.POLICY_DATA && w.POLICY_DATA.length === 118,
     w.POLICY_DATA ? String(w.POLICY_DATA.length) : '未加载');
  ok('KaTeX 已就位 (renderMathInElement)',
     typeof w.renderMathInElement === 'function',
     typeof w.renderMathInElement);
  ok('KaTeX 字体 CSS 已引入',
     !!w.document.querySelector('link[href*="katex"]'));

  // 3) esc() 引号转义
  try {
    const e = w.esc('a"b\'c&d<e>f');
    ok('esc 转义引号', e.includes('&quot;') && e.includes('&#39;') && e.includes('&amp;'), e);
  } catch (err) { ok('esc 转义引号', false, err.message); }

  // 4) 公式渲染：拿真实题干走一遍 renderMathIn
  try {
    const q846 = w.OBJECTIVE_QUESTIONS.find(q => q.id === 'single-846');
    const box = w.document.createElement('div');
    box.innerHTML = '<p>' + w.esc(q846.stem) + '</p>';
    w.document.body.appendChild(box);
    w.renderMathIn(box);
    const katexEls = box.querySelectorAll('.katex');
    ok('公式题渲染出 KaTeX 节点', katexEls.length > 0, '找到 ' + katexEls.length + ' 个 .katex');
    ok('公式里不再残留 $$ 定界符', !box.textContent.includes('$$'),
       box.textContent.slice(0, 60));
  } catch (err) { ok('公式题渲染', false, err.message); }

  // 5) 单 $ 的货币文本不能被误判成公式
  try {
    const q302 = w.OBJECTIVE_QUESTIONS.find(q => q.id === 'single-302');
    const box2 = w.document.createElement('div');
    box2.innerHTML = '<p>' + w.esc(q302.stem) + '</p>';
    w.document.body.appendChild(box2);
    w.renderMathIn(box2);
    ok('20$/MWh 未被当成公式', box2.querySelectorAll('.katex').length === 0,
       '.katex 数量 ' + box2.querySelectorAll('.katex').length);
    ok('货币文本完整保留', box2.textContent.includes('20$/MWh'), '');
  } catch (err) { ok('货币文本未被误判', false, err.message); }

  // 6) 简答题答案已补齐
  try {
    const bad = ['short-22', 'short-23', 'short-24', 'short-29'].filter(id => {
      const q = w.OBJECTIVE_QUESTIONS.find(x => x.id === id);
      return !q || !q.reference || q.reference.includes('此处为简答题') ||
             q.reference.trim() === '参考答案：' || q.reference.length < 100;
    });
    ok('4 道简答题答案已补齐', bad.length === 0, bad.length ? '仍缺: ' + bad.join(',') : '');
    const s23 = w.OBJECTIVE_QUESTIONS.find(x => x.id === 'short-23');
    ok('short-23 题干已剥离混入的答案', !s23.stem.includes('一体化建设运营南方区域电力市场'),
       s23.stem.slice(-30));
  } catch (err) { ok('简答题答案检查', false, err.message); }

  // 7) 实体不再原样显示
  try {
    let entLeft = 0;
    w.OBJECTIVE_QUESTIONS.forEach(q => {
      [q.stem, q.answerText, ...(q.options || []).map(o => o.text)].forEach(v => {
        if (typeof v === 'string' && /&(?:quot|amp|#039|#39);/.test(v)) entLeft++;
      });
    });
    ok('题库无残留 HTML 实体', entLeft === 0, '残留 ' + entLeft);
  } catch (err) { ok('实体检查', false, err.message); }

  // 8) 真实走一遍题型切换渲染，看会不会抛异常
  try {
    w.switchQuestionType('single');
    await wait(120);
    const ca = w.document.getElementById('contentArea');
    ok('切换单选题渲染成功', ca && ca.innerHTML.length > 200, '内容长度 ' + (ca ? ca.innerHTML.length : 0));
  } catch (err) { ok('切换单选题渲染', false, err.message); }

  try {
    w.switchQuestionType('policy');
    await wait(120);
    const ca = w.document.getElementById('contentArea');
    ok('切换政策库渲染成功', ca && ca.innerHTML.includes('policy-category-card'), '');
  } catch (err) { ok('切换政策库渲染', false, err.message); }

  // 9) 计算题（DATA 内联在 index.html，按 CALCULATION_IDS 划分）
  try {
    // richQuestions() 依赖 activeBank，必须先切到计算题视图再取
    w.switchQuestionType('calculation');
    await wait(150);
    const calc = w.richQuestions ? w.richQuestions() : [];
    ok('计算题共 32 道', calc.length === 32, '实际 ' + calc.length + ' 道');
    // DATA 是 const 声明，不会挂到 window，只能借 richQuestions() 反推仿真分析数量
    w.switchQuestionType('analysis');
    await wait(150);
    const anal = w.richQuestions ? w.richQuestions() : [];
    ok('仿真分析共 13 道', anal.length === 13, '实际 ' + anal.length + ' 道');
    ok('两类题 id 无重复',
       calc.filter(q => anal.some(a => a.id === q.id)).length === 0,
       '重复 ' + calc.filter(q => anal.some(a => a.id === q.id)).length + ' 条');
    const q44 = calc.find(q => q.id === 44);
    const q45 = calc.find(q => q.id === 45);
    ok('id44 垄断定价题已入库', !!q44 && q44.answers.length === 3,
       q44 ? q44.title : '未找到');
    ok('id45 备用市场题已入库', !!q45 && q45.answers.length === 3,
       q45 ? q45.title : '未找到');
    // 渲染新题 id45（排在计算题列表最后一位），验证公式与表格都能出
    w.switchQuestionType('calculation');
    await wait(150);
    const idx45 = calc.findIndex(q => q.id === 45);
    ok('id45 位于计算题列表末位', idx45 === calc.length - 1,
       '索引 ' + idx45 + ' / 共 ' + calc.length + ' 道');
    // id45（备用市场题）：表格为主
    w.goTo(idx45);
    await wait(150);
    const cb45 = w.document.getElementById('contentArea');
    ok('id45 渲染成功', cb45 && cb45.innerHTML.length > 500,
       '内容长度 ' + (cb45 ? cb45.innerHTML.length : 0));
    ok('id45 表格渲染', cb45 && cb45.querySelectorAll('.data-table table').length >= 2,
       '表格数 ' + (cb45 ? cb45.querySelectorAll('.data-table table').length : 0));
    // id44（垄断定价题）：含 KaTeX 公式
    const idx44 = calc.findIndex(q => q.id === 44);
    w.goTo(idx44);
    await wait(150);
    const cb44 = w.document.getElementById('contentArea');
    ok('id44 渲染成功', cb44 && cb44.innerHTML.length > 500,
       '内容长度 ' + (cb44 ? cb44.innerHTML.length : 0));
    ok('id44 公式渲染出 KaTeX', cb44 && cb44.querySelectorAll('.katex').length >= 5,
       '.katex 数量 ' + (cb44 ? cb44.querySelectorAll('.katex').length : 0));
    ok('id44 汇总表渲染', cb44 && cb44.querySelectorAll('.data-table table').length >= 1,
       '表格数 ' + (cb44 ? cb44.querySelectorAll('.data-table table').length : 0));
    ok('新题公式无 KaTeX 解析错误',
       cb44 && cb44.querySelectorAll('.katex-error').length === 0,
       '错误节点 ' + (cb44 ? cb44.querySelectorAll('.katex-error').length : 0) + ' 个');
    ok('新题无残留 $$ 定界符',
       cb44 && cb45 && !cb44.textContent.includes('$$') && !cb45.textContent.includes('$$'), '');
  } catch (err) { ok('计算题检查', false, err.message); }

  // 输出
  const out = [];
  out.push('='.repeat(72));
  out.push('运行时冒烟测试结果');
  out.push('='.repeat(72));
  let pass = 0, fail = 0;
  results.forEach(r => {
    out.push(`${r.pass ? '✅' : '❌'} ${r.name}${r.extra ? '  → ' + r.extra : ''}`);
    r.pass ? pass++ : fail++;
  });
  out.push('');
  out.push(`通过 ${pass} / 失败 ${fail}`);
  if (notImpl.length) {
    out.push('');
    out.push(`--- jsdom 未实现的浏览器 API（${notImpl.length} 处，非页面问题，已忽略）---`);
    [...new Set(notImpl)].slice(0, 5).forEach(e => out.push('  ' + e));
  }
  if (errors.length) {
    out.push('');
    out.push('--- 捕获到的错误 ---');
    errors.slice(0, 10).forEach(e => out.push('  ' + e));
  }
  const text = out.join('\n');
  fs.writeFileSync('.audit/smoke_out.txt', text + '\n', 'utf8');
  console.log(text);
  server.close();
  dom.window.close();
  process.exit(fail > 0 ? 1 : 0);
})();
