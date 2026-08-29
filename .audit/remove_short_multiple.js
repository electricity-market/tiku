/* 删除选项不足 4 个的多选题。
 * 说明：多选题必须提供 A/B/C/D 四个选项，若少于 4 个则无法按规则作答，按用户要求直接删除。
 * 策略：仅删除数组中对应的完整行，不重写其他题目，避免破坏原文件中的特殊转义。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(process.cwd(), 'objective-questions.js');
const BAK = FILE + '.bak.' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

// 备份原文件
fs.copyFileSync(FILE, BAK);
console.log('已备份原文件到:', BAK);

// 用 vm 解析数组（可正确处理 \$ 等 JS 字符串转义）
const ctx = { window: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(FILE, 'utf8'), ctx);
const items = ctx.OBJECTIVE_QUESTIONS || ctx.window.OBJECTIVE_QUESTIONS;

const beforeTotal = items.length;
const beforeMultiple = items.filter(q => q.type === 'multiple').length;

const removed = items.filter(q => q.type === 'multiple' && Array.isArray(q.options) && q.options.length < 4);
const removeIds = new Set(removed.map(q => q.id));

if (removed.length === 0) {
  console.log('没有需要删除的题目');
  process.exit(0);
}

console.log('\n删除题目清单（' + removed.length + ' 道）:');
removed.forEach(q => {
  const opts = (q.options || []).map(o => o.letter).join('');
  console.log('  ' + q.id + ' | 选项' + opts.padEnd(4) + ' | ' + q.stem.slice(0, 60) + (q.stem.length > 60 ? '…' : ''));
});

// 按行处理原文件：只删除目标 id 所在的完整数据行
const lines = fs.readFileSync(BAK, 'utf8').split('\n');
const newLines = [];
let dropNextComma = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const idMatch = line.match(/"id"\s*:\s*"([^"]+)"/);
  const id = idMatch ? idMatch[1] : null;

  if (id && removeIds.has(id)) {
    // 删除本行。文件格式约定：第一个元素行首无逗号，其余元素行首有逗号。
    // 若删除的是“无前导逗号”的第一个元素，则需要把下一行的前导逗号去掉；
    // 若删除的是“有前导逗号”的普通元素，直接删除本行即可，下一行逗号保留。
    if (!line.trim().startsWith(',')) {
      dropNextComma = true;
    }
    continue;
  }

  let outLine = line;
  if (dropNextComma) {
    outLine = line.replace(/^\s*,/, match => match.replace(',', ''));
    dropNextComma = false;
  }
  newLines.push(outLine);
}

// 更新头部注释中的统计
const afterKept = items.filter(q => !removeIds.has(q.id));
const afterTotal = afterKept.length;
const afterMultiple = afterKept.filter(q => q.type === 'multiple').length;
const afterSingle = afterKept.filter(q => q.type === 'single').length;
const afterJudge = afterKept.filter(q => q.type === 'judge').length;
const afterShort = afterKept.filter(q => q.type === 'short').length;

const headEnd = newLines.findIndex(l => l.startsWith('window.OBJECTIVE_QUESTIONS='));
if (headEnd < 0) {
  console.error('找不到文件头结束位置');
  process.exit(1);
}
for (let i = 0; i < headEnd; i++) {
  newLines[i] = newLines[i]
    .replace(/总题数: \d+/, '总题数: ' + afterTotal)
    .replace(/单选: \d+ \| 多选: \d+ \| 判断: \d+ \| 简答: \d+/, '单选: ' + afterSingle + ' | 多选: ' + afterMultiple + ' | 判断: ' + afterJudge + ' | 简答: ' + afterShort);
}

// 追加审计记录
newLines.push('');
newLines.push('/* 审计记录 ' + new Date().toISOString() + ' */');
newLines.push('/* 删除原因: 多选题选项数量 < 4，不符合答题规则 */');
newLines.push('/* 删除题目: ' + Array.from(removeIds).sort().join(', ') + ' */');
newLines.push('/* 备份文件: ' + BAK + ' */');

fs.writeFileSync(FILE, newLines.join('\n'), 'utf8');

console.log('\n统计变化:');
console.log('  总题数 : ' + beforeTotal + ' -> ' + afterTotal + ' (-' + removed.length + ')');
console.log('  多选题 : ' + beforeMultiple + ' -> ' + afterMultiple + ' (-' + removed.length + ')');
console.log('  单选题 : ' + afterSingle);
console.log('  判断题 : ' + afterJudge);
console.log('  简答题 : ' + afterShort);
console.log('\n已写入:', FILE);
