# 项目长期记忆：wangzhan（电力市场政策库 + 题库静态站）

单页静态站，无后端。用户是电力市场方向学生，用它备考 2026 年华电电力交易员考试。

## 文件构成
| 文件 | 内容 |
|---|---|
| `index.html` | 全部内联 JS（约 594KB），页面骨架 + 交互，**计算题/仿真分析数据 `DATA` 也在里面** |
| `objective-questions.js` | 客观题库，`window.OBJECTIVE_QUESTIONS`，**2596 题**（单选 1491 / 多选 564 / 判断 475 / 简答 66） |
| `policy-library-data.js` | 政策条目 `POLICY_DATA` + PDF 映射 `POLICY_PDF_MAP` |
| `policy-dates.js` | `POLICY_DATES`，政策发布日期 |
| `policies/library/` | 109 个政策 PDF（与 109 条映射一一对应） |
| `vendor/katex/` | 自托管 KaTeX |

## 计算题 / 仿真分析（`DATA`，全部内联在 index.html）
- **两个题型共用同一个 `DATA` 数组**，靠 `CALCULATION_IDS`（14~45）区分：
  在名单里 = 计算题，不在 = 仿真分析。首页入口、侧边栏、搜题都按这个划分。
- **`DATA` 由两部分拼成**：`const DATA = [ ... ]` 字面量（14 条，id 1-12/14/15）
  ＋ 紧随其后的 **30 条 `DATA.push({...})`**（id 13、16-45）。
  🔴 **统计题目时必须把 push 的算进去**，只看数组字面量会严重少算（曾据此误判"计算题只有 2 道"）。
- 🔴 **新增题目必须：id 取 `max+1`，并把新 id 加进 `CALCULATION_IDS`（若属计算题）**；
  且**写成 `DATA.push(...)` 追加到 push 区末尾**（插在数组字面量里会排到列表第 3、4 位，
  因为字面量先于所有 push 执行）。
- 题结构：`{id, title, category, problems:[...], answers:[{title, blocks:[...]}]}`；
  block 支持 **纯字符串 / `{type:'table',headers,rows,caption}` / `{type:'img',src,caption}`**。
- 🔴 **`problems` 和 `answers[].blocks` 是纯字符串数组**，字符串直接当文本（含 `$$` 公式）；
  **对象只支持 `type:'table'` 和 `type:'img'`**。`renderBlock` 对 `{type:'text',text:...}` 对象
  会直接 `return ''` —— **文本 block 绝不能写成对象**，否则整段文字丢失（id47 初版踩过，
  katex 数=0、ans-body 全空）。
- 🔴 **`renderText` 会按 `(数字)` / `（数字）` 拆段**（index.html 4048–4049 行）：
  ```js
  let parts = t.split(/(?=（[0-9]+）)/g);
  if (parts.length <= 1) parts = t.split(/(?=\([0-9]+\))/g);
  ```
  文本里出现 `$$...（600）...$$` 会被拆成两个 `<p>`，**跨节点的 `$$` 无法配对**，公式不渲染。
  → **公式内禁止含 `（数字）` 或 `(数字)` 模式**；表达代入某值用 "代入 x=600 后" 等纯文字，
  不要把数字包在括号里（id48 初版踩过，katex 数 18→20、残留 `$$`）。
- **KaTeX 只配置了 `$$` 定界符**（`delimiters:[{left:'$$',right:'$$',display:false}]`），
  **行内单 `$...$` 不渲染**。所有公式（含行内）必须用 `$$...$$` 包裹，否则公式不显示。
- **`$$...$$` 会被 KaTeX 渲染**（`renderMathIn` → `renderMathInElement`，display:false）。
  写公式用 JSON/JS 字符串时反斜杠要成对转义；建议用 `json.dumps(..., ensure_ascii=False)`
  生成紧凑 JSON 再 push，公式里的 `\frac` 才不会被 JS 当成 `\f` 换页符吃掉。
- `DATA` 是 `const`，**不挂 window**；jsdom 测试里拿不到 `w.DATA`，只能用 `w.richQuestions()`
  （它依赖 `activeBank`，**必须先 `switchQuestionType('calculation')` 再取**，否则拿到的是仿真分析）。

## 项目约定（改代码前必读）
- **政策唯一键 = `doc + '|' + title`**（`policyKey()`）。PDF 映射和日期键都用这个键。
- **`POLICY_PDF_MAP` 定义在 `policy-library-data.js`，不在 index.html。**
- **改数据文件后必须 bump `index.html` 里的 `<script src="x.js?v=YYYYMMDD-N">` 缓存串**，
  否则用户浏览器还读旧数据。
- **改数据后同步更新 `.audit/smoke.js` 里的硬编码期望值**（`POLICY_DATA.length === 118`、
  `OBJECTIVE_QUESTIONS.length === 2596`、计算题 34 道 / 仿真分析 13 道）。
- **用 Python 写文本文件必须 `io.open(..., newline='')`**，否则默认把 LF 转成 CRLF，
  一次写入就产生几百行行尾噪音。
- 换行符统一 LF，由 `.gitattributes` 的 `* text=auto eol=lf` 保证（2026-08-29 已归一化，
  现在改文件不再有几百行 CRLF 噪音）。
- **git 身份**：仓库级 `jiajun <jiajun@workbuddy.local>`。若提交报
  `Author identity unknown`，说明配置又被清了，照抄：
  `git config user.name "jiajun" && git config user.email "jiajun@workbuddy.local"`
- **改完必须 push，只 commit 线上不会变**。远程：
  `git@github.com:electricity-market/tiku.git`。本机 HTTPS 必断流，**只能走 SSH**：
  ```bash
  GIT_SSH_COMMAND="ssh -i C:/Users/jiajun/.ssh/id_ed25519 -o StrictHostKeyChecking=no" \
    git push origin main
  ```
  （2026-08-29 曾积压 6 个提交、2026-08-31 又积压 11 个，用户以为改动没生效。
  先 `git status -sb` 看是否 ahead）
- **`git status -sb` 的 "ahead N" 可能不准**：实测 push 成功后本地 `refs/remotes/origin/main`
  没跟着刷新，一直显示 ahead 12。判断线上是否同步**以 `git ls-remote origin main` 为准**，
  它返回的 sha 等于本地 HEAD 就是真推上去了。

## 数据真实性铁律
**给政策条目补 PDF / 补链接之前，先验证条目本身是否真实存在。**
源数据里混有 AI 生成的虚构条目（已查出并删除过「国能发电力〔2025〕77 号」）。
核查顺序：
1. 拿现有 URL 去 WebFetch，看实际内容与标题是否吻合（踩过：URL 指向无关的
   人大建议答复；日期键还是从那个错误 URL 的路径推出来的）
2. 换 3-4 组关键词 + `allowed_domains` 定向官方域名搜索
3. 比对同期该部委实际发布的文件
查不到出处就是假的，**不要按标题造 PDF 塞进去**。

## 已知"看起来像 bug 但不是"（别重复排查）
- 9 组"重复政策"是**跨分类双归属**（如 1490 号附件 1-4 同属"输配电价"和"跨区输电"），符合预期，不要去重。
- 4 组"重复题干"是**题型套话雷同**（前 60 字比对命中，完整题干 0 重复）。
- 2591 题 `explanation` **100% 为空是源数据没有**，不是解析功能坏了（用户已搁置，暂不补）。
- `policies/` 根下那 24 个两位数字命名的 PDF（policy-01~24）是**另一批一直都在的旧文件**，
  与 `library/` 里的三位数字命名（policy-001 等）无关，别混为一谈。

## 校验与测试工具（`.audit/`，可整个删除，也可复跑）
- `check.js` —— 数据全量校验（断链/幽灵键/孤儿/日期键/题库字段）
- `smoke.js` —— jsdom 冒烟，**必须起本地 http，不能用 file://**（opaque origin
  会让 localStorage 抛 SecurityError，引发一堆假报错）。`Not implemented: scrollTo`
  是 jsdom 自己的问题，过滤掉。
- `orphans.js` —— 孤儿 PDF / 断链专项检查
- `completeness.js` —— 仓库自包含性（引用是否都存在且已 git add），退出码非 0 即有问题
- `remove_short_multiple.js` —— 按行删除指定题目（⚠️ 改数据，已执行过）
  （题库含 `\$` 等 JS 合法但 JSON 非法的转义，**不能整体 JSON.parse 再重新序列化**，
   必须按行删除）

## 本机环境坑
- **批量 `git rm` 多路径会把整个目录一起搞没**（2026-08-29 实测，98 个文件全消失）。
  根因高度怀疑是 Windows Defender + 火绒 HIPS + 荣耀管家三套安全软件并存，
  批量删同目录文件被误判为勒索行为。
  → **删文件一律逐个 `rm` + 每删一个立刻 `ls | wc -l` 校验。**
  → 恢复：`git checkout HEAD -- <dir>/`（前提是文件已入库，所以重要产物一定要 git add）。
- 所有公共 CDN 本机不可达，前端依赖走 `npm install` 后自托管到 `vendor/`。
- 托管 Python 无 pypdf；系统 Python 有：
  `C:/Users/jiajun/AppData/Local/Programs/Python/Python314/python.exe`（pypdf 6.14.2）
- PDF 文本提取会在词间插空格，做关键词匹配前必须 `re.sub(r'\s+','',text)`。
