/* ⚠️ 已执行完毕的一次性数据修复脚本，不要重复运行！
 *
 * 本脚本把 4 道简答题（short-22/23/24/29）的参考答案写进了 objective-questions.js，
 * 答案内容是硬编码在下面的。重跑会用脚本里的旧文本覆盖现有数据 ——
 * 如果之后人工润色过这几道题的答案，重跑会把改动冲掉。
 *
 * 保留在仓库里是为了可追溯：能看出数据当初是怎么被改的。要看修复逻辑就看这里。
 *
 * 原说明（保留备查）：
 *   补齐 4 道简答题的占位参考答案，并清理 short-23 题干中混进来的答案片段。
 *   注意：简答题答案在页面上是用 q.reference 渲染的（showReferenceAnswer），
 *   answerText 是同一份内容的副本，两处都要改，否则只改一处不生效。
 *   结果框 CSS 是 white-space: pre-line，所以答案里用 \n 就能正常换行。 */
const fs = require('fs');
const vm = require('vm');
const F = 'objective-questions.js';

const ANSWERS = {
  'short-22':
'1. 失负荷价值与稀缺定价：价格上限应能反映尖峰时段的失负荷价值（VOLL），使机组在极端时段获得合理的稀缺租金、引导长期容量充裕；上限过低会抑制投资，过高则放大用户负担。\n' +
'2. 发电机组成本结构：参照系统内边际机组的最高可变成本，以及启停成本、空载成本、最小技术出力；价格下限要考虑机组降至最小技术出力时的变动成本，避免长期低于成本运行。\n' +
'3. 用户侧承受能力：结合工商业用户电费敏感度、居民农业用电交叉补贴、终端电价波动容忍度，防止价格剧烈波动向终端传导。\n' +
'4. 抑制市场力：结合市场集中度（HHI、Top-4 份额）、阻塞断面、必开机组比例来设定，防止发电商在高峰和阻塞时段行使市场力。\n' +
'5. 与中长期、辅助服务衔接：与中长期签约比例、差价结算（CfD）、辅助服务补偿上限、容量补偿机制协调，避免跨市场套利和收益挤压。\n' +
'6. 跨省跨区因素：送端与受端价格上限的协调、直流通道输电价格与网损、外来电对省内价格的影响。\n' +
'7. 新能源与储能特性：新能源大发时段是否允许负电价、负电价下限深度，以及储能充放电的套利空间。\n' +
'8. 监管政策要求：国家发展改革委、国家能源局的限价政策要求，以及地方现货试点规则的限价参数与动态调整机制。',

  'short-23':
'依据《国务院办公厅关于完善全国统一电力市场体系的实施意见》（国办发〔2026〕4号），推动电力资源在全国范围优化配置主要包括：\n' +
'1. 一体化建设运营区域电力市场：一体化建设运营南方区域电力市场，完善长三角电力互济，在省间交易框架下探索区域内同步电网电力互济交易。\n' +
'2. 完善跨省跨区交易机制：扩大省间中长期交易规模，推动年度、月度、月内多周期常态化开市；完善省间现货市场，实现省间余缺互济。\n' +
'3. 推进跨经营区常态化交易：完善国家电网与南方电网之间的跨经营区交易机制，实现常态化开市、灵活互济。\n' +
'4. 打通输电通道与价格机制：加强跨省跨区输电通道建设，完善区域电网输电价格、跨省跨区专项工程输电价格定价办法，推进输电权市场化交易。\n' +
'5. 破除省间壁垒：清理地方保护性政策和对省间交易的行政限制，落实"统一市场、两级运作"，保障外送电按合同执行。\n' +
'6. 促进新能源跨区消纳：完善绿电交易与绿证制度，推动沙戈荒等大型新能源基地外送与受端消纳相衔接。\n' +
'7. 统一平台与信息：推动交易机构互联互通、一地注册各方共享，统一信息披露标准，降低跨省交易的信息成本。',

  'short-24':
'依据《国务院办公厅关于完善全国统一电力市场体系的实施意见》（国办发〔2026〕4号），构建全国统一的电力市场制度体系主要包括：\n' +
'1. 统一规则体系：完善以《电力市场运行基本规则》为基础的"1+N"规则体系，统一中长期、现货、辅助服务市场基本规则，各地实施细则与之衔接并报备。\n' +
'2. 统一技术标准与交易时序：统一出清模型（SCUC/SCED）、结算算法、数据接口、交易时序与信息披露规范，实现各地市场技术可对接。\n' +
'3. 统一监管与评价体系：建立全国统一电力市场评价制度，强化市场监管、市场力监测、风险防控和信用管理。\n' +
'4. 统一平台与运营：推动交易机构独立规范运行、交易平台互联互通，实现经营主体一地注册、各方共享。\n' +
'5. 主体平等准入：保障发电企业、售电公司、电力用户、新型储能、虚拟电厂、负荷聚合商等经营主体平等准入、公平竞争。\n' +
'6. 统一价格机制：统一输配电价核定、分时电价机制、容量补偿或容量市场机制、辅助服务价格形成机制。\n' +
'7. 法治保障：推动《电力法》修订，完善电力市场相关规章，为市场规则的执行提供法律依据。',

  'short-29':
'本次突发事件沿"国际油气价格—煤炭价格—电力价格"链条传导；本厂省内中长期比例低、现货敞口大，应重点调研以下方面：\n\n' +
'一、燃料成本与供应保障\n' +
'1. 本厂电煤库存可用天数、已签合同的量价与兑现率、后续采购渠道是否稳定。\n' +
'2. 国际动力煤价格（纽卡斯尔、API2）与国内煤价（秦皇岛、CECI）的联动关系，霍尔木兹海峡封锁对进口煤海运航线、运价及到岸成本的影响。\n' +
'3. 形成未来 1—3 个月的到厂煤价预期，作为现货报价的边际成本底线。\n\n' +
'二、市场规则与价格水平\n' +
'4. 该省现货市场结算试运行规则、价格上下限与价格帽设定、日前与实时出清价格走势、峰谷价差、近期均价。\n' +
'5. 中长期欠发、超发的结算规则，是否允许在月内、旬交易补签以锁定部分收益。\n\n' +
'三、供需形势与竞争格局\n' +
'6. 省内负荷预测、装机结构、来水与风光出力预测、机组检修计划、外来电送电计划及通道可用输电能力。\n' +
'7. 区域内燃气机组占比，以及气价上涨后其边际成本的抬升幅度——气电成本上移会抬高现货价格中枢、扩大煤电的相对成本优势。\n\n' +
'四、本厂机组特性与其他收益\n' +
'8. 本厂最小技术出力、爬坡率、启停与空载成本、供电煤耗曲线，据此构造分段报价曲线。\n' +
'9. 辅助服务（调频、备用）补偿、容量补偿或容量电价等其他收益来源。\n\n' +
'五、报价策略建议\n' +
'能源价格上行叠加气电成本抬升，现货价格中枢大概率上移，且煤电相对优势扩大。应在现货中按真实边际成本（含燃料涨价预期）分段报价，争取高峰时段高价中标、多发电量；同时择机在月内中长期交易补签以锁定部分收益、压降现货敞口，并同步跟踪补库成本，避免"高价卖电、更高价买煤"侵蚀利润。'
};

// short-23 题干尾部混进了答案片段，需要剥离
const STEM_FIX = {
  'short-23': '根据《国务院办公厅关于完善全国统一电力市场体系的实施意见》国办发[2026]4号，阐述如何推动电力资源在全国范围内优化配置？'
};

const raw = fs.readFileSync(F, 'utf8');
const lines = raw.split('\n');

// 先确认每题确实是"一行一个对象"，否则脚本会改错地方
function loadQs(text) {
  const s = { window: {}, console };
  vm.createContext(s);
  vm.runInContext(text, s, { filename: F });
  return s.window.OBJECTIVE_QUESTIONS || [];
}
const qBefore = loadQs(raw);
// 深拷贝一份快照：下面会就地修改 qBefore 里的对象，不存快照的话比对就失去意义了
const snapshot = JSON.parse(JSON.stringify(qBefore));

const targets = Object.keys(ANSWERS);
let changed = 0;
const report = [];

targets.forEach(id => {
  const idx = lines.findIndex(l => l.indexOf('"id": "' + id + '"') >= 0);
  if (idx < 0) { console.log(`❌ 未找到 ${id} 所在行`); return; }
  const line = lines[idx];
  const comma = line.startsWith(',');
  const obj = qBefore.find(q => q.id === id);

  const oldRef = obj.reference;
  const oldStem = obj.stem;
  obj.reference = ANSWERS[id];
  obj.answerText = ANSWERS[id];
  if (STEM_FIX[id]) obj.stem = STEM_FIX[id];

  const json = JSON.stringify(obj);
  lines[idx] = (comma ? ',' : '') + json;
  changed++;
  report.push({ id, oldRef: String(oldRef).slice(0, 50), newLen: ANSWERS[id].length,
                stemChanged: !!STEM_FIX[id], oldStemLen: oldStem.length, newStemLen: obj.stem.length });
});

if (changed !== targets.length) { console.log('❌ 有题目未处理，放弃修改'); process.exit(1); }

const out = lines.join('\n');
const tmp = F + '.tmp';
fs.writeFileSync(tmp, out, 'utf8');

// 注意：这里要读文件内容再交给 VM，直接传路径会把路径当 JS 表达式执行
const qAfter = loadQs(fs.readFileSync(tmp, 'utf8'));
console.log(`题数: ${qBefore.length} -> ${qAfter.length}`);
if (qAfter.length !== qBefore.length) { fs.unlinkSync(tmp); console.log('❌ 题数不一致，已放弃'); process.exit(1); }

// 校验：只有目标题的 reference/answerText/stem 变了，其余题目一字不动
let otherDiff = 0;
for (let i = 0; i < snapshot.length; i++) {
  const a = snapshot[i], b = qAfter[i];
  if (a.id !== b.id) { otherDiff++; continue; }
  const isTarget = targets.includes(a.id);
  ['stem', 'answerText', 'reference', 'explanation', 'title', 'type', 'number', 'order'].forEach(f => {
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
      if (!isTarget) { otherDiff++; console.log(`  ⚠ 非目标题 ${a.id}.${f} 被改动`); }
    }
  });
  if (JSON.stringify(a.options) !== JSON.stringify(b.options)) { otherDiff++; console.log(`  ⚠ ${a.id}.options 被改动`); }
}
// 目标题校验
targets.forEach(id => {
  const b = qAfter.find(q => q.id === id);
  if (b.reference !== ANSWERS[id] || b.answerText !== ANSWERS[id]) {
    otherDiff++; console.log(`  ⚠ ${id} 答案未写入成功`);
  }
  if (STEM_FIX[id] && b.stem !== STEM_FIX[id]) { otherDiff++; console.log(`  ⚠ ${id} 题干未修正`); }
});

console.log('\n处理结果:');
report.forEach(r => console.log(`  ${r.id}: 答案 ${r.newLen} 字${r.stemChanged ? `, 题干 ${r.oldStemLen} → ${r.newStemLen} 字` : ''}`));
console.log(`\n非预期改动: ${otherDiff}`);

if (otherDiff === 0) {
  fs.renameSync(tmp, F);
  console.log('\n✅ 校验通过，已写入 objective-questions.js');
} else {
  fs.unlinkSync(tmp);
  console.log('\n❌ 校验未通过，未修改原文件');
  process.exit(1);
}
