const fs=require('fs'),path=require('path'),vm=require('vm');
const ctx={window:{},console};ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('policy-library-data.js','utf8'),ctx);
const MAP=ctx.POLICY_PDF_MAP||ctx.window.POLICY_PDF_MAP||{};
const used=new Set(Object.values(MAP).map(v=>String(v).split('/').pop().toLowerCase()));
// 全站其它引用扫描（html + js）
const scan=['index.html','policy-library-data.js','policy-dates.js','objective-questions.js'];
const other=new Set();
for(const f of scan){ if(!fs.existsSync(f))continue;
  const t=fs.readFileSync(f,'utf8');
  for(const m of t.matchAll(/policies\/library\/([A-Za-z0-9_\-\.]+\.pdf)/gi)) other.add(m[1].toLowerCase());
}
const dir='policies/library';
const files=fs.readdirSync(dir).filter(f=>f.toLowerCase().endsWith('.pdf'));
const orphans=files.filter(f=>!used.has(f.toLowerCase())&&!other.has(f.toLowerCase()));
console.log('PDF总数:',files.length,'| 映射引用:',used.size,'| 孤儿:',orphans.length);
console.log('--- 孤儿清单 ---');
let tot=0;
for(const f of orphans.sort()){const s=fs.statSync(path.join(dir,f)).size;tot+=s;
  console.log(f.padEnd(20),(s/1024).toFixed(0).padStart(6)+' KB');}
console.log('合计:',(tot/1024/1024).toFixed(2),'MB');
// 反向校验：映射里有但文件不存在
const missing=[...used].filter(f=>!files.some(x=>x.toLowerCase()===f));
console.log('断链(映射有/文件无):',missing.length,missing.join(','));
