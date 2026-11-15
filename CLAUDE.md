# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git 提交纪律(最高优先级)

**只有在用户明确发话要求提交时,才允许 `git commit` / `git push`。**
完成代码改动后停下来汇报,等用户确认。绝不自动提交、绝不自动推送。
历史上有过自动 push 被权限系统拦截的先例 —— 不要重试被拦截的 push,询问用户。

## 项目概述

个人站点(https://maxhello.github.io):React 19 + Vite 6 + TypeScript + Tailwind CSS 4 + MDX 博客 + 英语学习数据面板 + AI 口语陪练页。前端静态构建、GitHub Pages 部署;后端 `site-api/` 跑在自己的 k3s 上,学习数据住在它的 PostgreSQL 里、页面运行时读接口(2026-11-15 起,见「仓库构成」与「数据流」)。

## 仓库构成(2026-11-15 起)

2026-11-15 把独立仓库 maxhello/livekit-tutor 并了进来(只搬代码),全仓库 = 一个前端 + 一个后端 + 一个语音 agent:

- **前端** `src/`:站点 + AI 口语陪练页。陪练页代码在 `src/tutor/`,路由 `/english/tutor`(`src/pages/Tutor.tsx`):全屏通话界面,**不套 Layout**,整体懒加载(livekit-client 600KB+ 只在这页下载),样式 `src/tutor/tutor.css` 挂在 `.tutor-app` 容器下、自成一套通话界面配色(并入前原样,不走站点 `.card/.btn-*` 体系;按钮类名 `.tutor-btn-primary` 避开站点的 `.btn-primary`)。旧网址 `/livekit-tutor/` = `public/livekit-tutor/index.html` 静态跳转(带查询参数和 hash)。陪练页的单元数据(`src/tutor/units.ts`)与学习路径页同源(`lib/learning.ts` + `loadGuidebooks()`);`src/tutor/UnitGuide.tsx` 是通话界面里的另一套指南渲染,与站点的 `components/UnitGuide.tsx` 渲染部分仍各写各的。
- **后端** `site-api/`(FastAPI + Neon PostgreSQL,独立 uv 项目):陪练的登录/房间 token/历史 + 站点学习数据。`server-image.yml` 在 `site-api/**` 变动时构建 `ghcr.io/maxhello/site-api`。k8s 清单在私有仓库 oracle-k3s,不在这里;本机 kubectl 默认上下文是工作集群,**操作 k3s 一律显式 `--context oracle-k3s`**。
- **语音 agent** `tutor-agent/`(Emma,部署到 LiveKit Cloud:在该目录下 `lk agent deploy`)。**陪练三部分的细节(连接流程、纠错卡片、测试方法)看 `tutor-agent/CLAUDE.md`**,改陪练相关代码前先读它;改了 `src/tutor/` 要把 `Tutor.tsx` 的 `APP_VERSION` +1。
- `src/index.css` 用 `@source not` 把 `site-api/`、`tutor-agent/` 排除在 Tailwind 扫描外。
- **学习数据在库里(2026-11-15 迁完)**:多邻国/Praktika 原先是「GitHub Actions 定时 + JSON 进 git」(GitHub 定时实测漂移 4~8 小时,227 个提交里 200 个是快照),现在是 PostgreSQL + k3s CronJob;`duolingo.yml`、`data/duolingo-history.json`、`data/praktika-history.json` 都已删除。细节见下面「数据流」第 2 条。

## 常用命令

```bash
npm run dev        # 开发服务器(启动前自动跑 data 脚本生成 repos.json / rss / sitemap)
npm run build      # tsc -b && vite build(先跑 prebuild → data 脚本)
npx vite preview   # 预览 dist
npm run test:py    # = cd site-api && uv run pytest:后端 + 采集器(多邻国/Praktika 合并逻辑)单测,需要 uv
(cd tutor-agent && uv run pytest)       # 陪练 agent 测试
npm run guidebooks                  # 手动拉多邻国单元指南 → data/duolingo-guidebooks.json(需 DUOLINGO_JWT,本地加 DUOLINGO_INSECURE=1)
```

前端没有测试、没有 lint。验证方式 = `npm run build` 通过 + `npm run test:py` 通过 + 本地预览。

## 架构

### 数据流

1. **构建时注入**:`prebuild` 跑 `npm run data` = `scripts/fetch-repos.ts`(拉仓库列表 → `src/data/repos.json`,gitignored,CI 用 `GITHUB_TOKEN`、本地匿名超限沿用旧文件)+ `scripts/gen-static.ts`(从 `content/posts` 生成 `public/rss.xml`/`sitemap.xml`/`robots.txt`,均 gitignored,域名取自 `site.config.ts`)。
2. **学习数据(多邻国 + Praktika)**:
   - **采集**:k3s CronJob `site-api-collect` 每天北京 04:30 跑 `python collect.py run`(清单 `oracle-k3s/deployment/site-api.yaml`,凭证 `DUOLINGO_JWT` / `PRAKTIKA_REFRESH_TOKEN` 是那里的 env,**绝不进本仓库**)。04:30 这个点是有意的:**快照行的"今天"在北京凌晨 5 点前算前一天**(`snapshot_day()`/`DAY_ROLLOVER_HOUR`),这一班正好给前一天收尾;当晚滞后进 xpGains 的课由次日这一班回填(回看 45 天,合并只增不减)。代价:白天学的课次日 04:30 才进库,**xpGains 对当天数据本来也有数小时滞后**(daily 里没有当天 key 时页面整行不展示——不做 totalXp 差值兜底,差值窗口横跨前一晚会把昨晚 XP 算成今天的)。想当天可见就给 CronJob 加班次。
   - **采集器** `site-api/collectors/{duolingo,praktika}.py`:只认文件(读模块级 `OUT` → 合并 → 写回),逻辑自 GitHub Actions 时代未改。`site-api/collect.py` 把库里文档落临时文件、改写 `OUT`、跑完读回存库。本地直接 `python3 site-api/collectors/duolingo.py` 仍可跑(写当前目录的 `data/`,调试用)。
   - **存储**:一张表 `learning_docs`,每份文档(`duolingo-history` / `praktika-history`)每天一行、同日覆盖,`is_latest` 标当前生效行(接口只读它),其余是历史副本保留 90 天,顶替原先的 git 回滚;`doc` 列是 JSON 不是 JSONB(JSONB 会重排键)。不拆关系表(用户定的:合并逻辑吃整份文档,且无按字段查询需求)。库里没文档时拒绝采集(防从零开始丢历史)。**手工改数据**(如 `manual.levelEntered`)= `kubectl --context oracle-k3s -n max exec deploy/site-api -- python collect.py dump <key>` → 改 → `exec -i ... collect.py seed <key> < file`。
   - **失败**:不记状态、不提醒(用户定的)。库里旧文档原样保留,页面继续显示上次数据,只有 k3s 里那次 Job 是失败状态。多邻国 JWT 过期就是这种表现——数据停更时先看 `kubectl ... get jobs`。
   - **读取**:`GET {site.api}/api/learning/<key>` 公开只读。前端唯一入口 `src/lib/learning.ts`:应用启动即拉接口(上限 10 秒),**没有构建快照、不做回退**(用户定的:接口不通就不显示,历史在 git 里)。**English / Now / Learn 在模块加载时一次性算好派生数据**,所以它们在 `App.tsx` 里是懒加载、且等 `learningReady` 为 true 才加载模块(`dataPage()`);取不到多邻国文档时这三页显示 "Learning data is temporarily unavailable",站点其余页面不受影响。Praktika 文档取不到只是口语相关区块隐藏。`lib/praktika.ts` 同理只能被这些页面引用。别在这些页面之外静态 import 它们。接口的 CORS 只放行 `https://maxhello.github.io` 和 `http://localhost:5173`:本地用别的端口预览会拉不到数据。
   - 消费方还有 maxhello/maxhello 的 profile 徽章(读 `days[-1]` 的 date/streak/totalXp)。
3. **博客内容**:`content/posts/*.mdx` 经 `import.meta.glob` eager 加载(`src/lib/posts.ts`)。**MDX 正文是 default export,不是命名 export**——这是曾导致文章页空白的坑。
4. **单元指南 + 学习路径页**(2026-09-15 起):`scripts/fetch-guidebooks.py`(`npm run guidebooks`,手动)拉多邻国 App 里每部分的"指南"→ `data/duolingo-guidebooks.json`(已提交,~400KB,**走动态 import 单独 chunk,只在 `/english/learn` 加载**,gzip ~70KB)。来源 `currentCourse.pathSectioned[].units[].guidebook.url`(CDN JSON,地址带哈希须先拿课程结构)。每单元存:`keySentences[]{en, zh(subtext 官方中文), tts(整句读音), words[]{w, hints[≤2], tts}}`(hints 来自 blockHints 的 hintTable,cell colspan>1 是词组释义;单字拆字释义有更长的就丢)+ `grammar[]{title, blocks[]{text|example{en,zh,tts}|table{rows}}}`。文本样式规律:fontSize 17 青色 = 分区标题,fontSize 25 加粗 = 语法点标题,其余正文,bold 片段保留 `**…**`。读音 mp3 公共前缀提到顶层 `ttsBase`,文件里只存哈希;CDN 公开可访问,浏览器 `new Audio()` 直接播。默认拉到当前 section 的下一段为止(现在 Intro+A1 共 70 单元),增量不重拉,`DUOLINGO_GUIDEBOOK_REFRESH=1` 全量、`DUOLINGO_GUIDEBOOK_SECTIONS=N` 指定段数。约一半单元没有语法点(70 里 32 有)。进入 A2 前手动跑一次,否则路径页该段显示"未缓存"。**不在 CI 定时跑**。
   消费方:`src/pages/Learn.tsx`(路由 `/english/learn`,参考多邻国 learn 页结构:顶部当前阶段横幅 + 蛇形节点路径 + 点节点开指南抽屉;进页在 useLayoutEffect 里 `scrollIntoView({behavior:'instant'})` 瞬时定位到当前节点(全站 html 是 smooth,不显式 instant 会看到往下滑);`?unit=<unitIndex>` 直接开某部分)+ `src/components/UnitGuide.tsx`(数据类型、`useGuidebooks()`、`UnitGuideBody`:句子喇叭读整句、点词弹释义并读该词、英文下中文)。样式在 index.css 的 learning path 区(`.btn-chunky/.path-banner/.path-node-*/.path-drawer`),**只借鉴布局交互,不用多邻国商标/配色/素材**。当前单元 = 最近一份带 `score.lastUnitDone` 的快照 + 1(`unitIndex` 是 API 的 0-based 全局编号;App 里"第 N 阶段第 M 部分" = `section+1` / `unitInSection`)。English 页不展示指南内容,入口 = CEFR journey 弧中心的段位文字整块是 Link("CURRENT LEVEL · OPEN PATH →"),不另开卡片。

5. **Praktika 口语**(2026-11-12 起):`site-api/collectors/praktika.py`,与多邻国同一个 CronJob(见第 2 条)。凭证 = `PRAKTIKA_REFRESH_TOKEN`(Firebase refresh token,长期有效)→ securetoken 换 id_token(**必须带 `Referer: https://app.praktika.ai/`,否则 403**)→ `/api/v16/tokens` 换 JWT。Firebase web key 是前端公开值,写在脚本常量里。接口是网页版的非官方 v16 接口。结构:`current`(streak/level/dailyGoal/plan 学习计划单元状态)、`daily{date:{lessons,minutes,aborted?}}`(只算 COMPLETED;ABORTED 中途退出只记次数)、`sessions`(近 30 天完成课,时长 = 单节详情 `createdAt→completedAt`,列表里没有)、`words`(课程 lexis 词表,只增不改)。按北京时间、按开始时间归日。daily 只重算 30 天保留窗口内的天(窗口外明细已裁,重算会写残),单测 `site-api/tests/test_collect_praktika.py`。失败策略:凭证没配 → 跳过(删掉 CronJob 里这项 env = 停用);配了但拉取失败 → 多邻国照常入库,Job 以失败结束。前端:`src/lib/praktika.ts`(派生数据)+ `src/components/SpeakingPractice.tsx`(English 页 Speaking practice 卡,无数据不渲染,超 7 天没练标 paused);English 页 Pulse/Activity 的分钟数按 App 叠放(青 = 多邻国,紫 = 口语;XP 降为虚线),**Level & score 只用多邻国数据**。

### 多邻国数据的关键设计

- 数据源三层:公开接口(保底,无 token)+ JWT 下的 `xp_summaries`(按天 XP/课数/**真实学习秒数**,可回溯到开课第一天,2026-09-11 起是 `daily` 的正式来源;之前 daily 的分钟数是按课间隔估算的,普遍高估一到两成,历史已整体刷成接口值)+ JWT 下的逐课 `xpGains`(约 15 天窗口,只用来反推 unitDone/scoreReached)。xp_summaries 拉不到与 JWT 失效同样处理:直接失败退出,不把没有明细的快照写进库。每次采集回看 `SUMMARY_DAYS`=45 天,一次性回填用环境变量 `DUOLINGO_SUMMARY_START=YYYY-MM-DD`。
- **档案是对象结构**(2026-08-20 从 list 改造,公共字段提升到外层):`{meta(静态身份: username/streakStart/learningLanguage), current(当前状态: sections/sessionCount/longestStreak/scoreMax,接口残缺时沿用旧值), days(纯时间序列: date/totalXp/streak/score/apiCoverage,一天一行,同日重跑覆盖), daily(近窗口流水账: {date: {lessons,minutes,xp}}), unitDone({unitIndex: 完成日}), scoreReached({分数: 到达日})}`。**unitDone/scoreReached 由逐课时间戳反推**(`extract_unit_progress()`:分数只在单元切换时跳变,完成时刻夹在本单元末课与下一单元首课之间;xpGains 每课带 `skillId` 对应单元,unit 130 起一个 skillId 跨多单元的不用),与采集时刻无关,**只增不改**(首次算出时窗口最全)。旧 list 文件由 `migrate()` 自动升级。消费方:本仓库 English.tsx / Now.tsx / Learn.tsx / 陪练页,以及 maxhello/maxhello 的 badge(读 `days[-1]` 的 date/streak/totalXp,已做双格式兼容)。
- **`xpGains` 是滚动窗口(约 15 天,按时间戳不按天)**:脚本必须把新拉到的天与档案 `daily` **合并**,同日冲突**保留 lessons 更多的一份**——窗口最老的那天重拉时只剩"边界时刻之后"的课,直接新覆盖旧会把完整日写成残缺日(2026-08-20 实锤:上午重跑把 8/5 从 18 课覆盖成 9 课)。此逻辑在 `collectors/duolingo.py` 的 `merge_history()`(有单测锁行为:`site-api/tests/test_collect_duolingo.py`)。
- **归日时区固定 `Asia/Shanghai`**(`TZ` 常量 + `day_key()`),不随运行环境变——本地(UTC+8)和 CI(UTC)结果必须一致。
- **防膨胀**:`daily` 全量住顶层(近 15 天窗口,滑出的天靠合并保留);`current` 状态字段只有一份;`unitDone` 每完成一个单元加一行,量级可忽略。文档一年 ~85KB,每次打开页面整份下发,别往 days 行塞每天不变的字段。
- **JWT 设置了但拉取失败(如过期)直接失败退出**(采集器 `SystemExit`,`collect.py` 接住后保留旧文档、Job 失败),绝不把没有明细的快照写进库。
- **多邻国分数**:days 行的 `score` = `{reached, lastUnitDone, nextAtUnit}`,reached 来自 `currentCourse.scoreMetadata.reachedScore`(10~160,CEFR 对齐,接口原值),`lastUnitDone`/`nextAtUnit` 从 pathSectioned 算;满分在 `current.scoreMax`。**单元节点的 `levelScoreInfo.reachedScore` = 学这个单元时持有的分数**(单元内一致,A1 段每 3 个单元一档),所以 `nextAtUnit` = 当前分数带的**末单元**(做完它就涨分)——2026-09-11 前错取成下一分带的末单元,预估多出一整个带,历史 26 行已按实时课程结构回填。页面分数展示(2026-09-11 定稿,参考 AtCoder 评分图 + Valorant 段位 + 信用分仪表):Hero 三栏 = 今日数据 · `ScoreBandChart`(纵轴 = 当前 CEFR 段的分数区间,取 `current.sections` 的 scoreMin/scoreMax,只画本段内的升分点,最后一点停在发生日**不往今天拖**;下方文案"在本段第几天",进段日 = 段起始分的 `scoreReached`,其次档案顶层 **`manual.levelEntered`**(手工字段,脚本不写不改:A1 = 2026-07-27,用户定级测试起步约 20 分即在 A1 区间,数日后选'太难'回落到 10 分段;`manual.placedLevels` = [Intro] 表示定级直接标完成、未实际学习,弧上显示 placed 而非 done),都没有才退回快照首见日并带 +)· `ScoreBadge`(六边形徽章写段位与分数,外环按本档单元数分格、已完成格亮起 = 到下一分的进度)。CEFR journey = `CefrArc` 五段等宽半圆弧,每段亮起比例 = 该段单元完成度,中心是当前段/完成度/剩余/ETA,**不放分数**。原 13% 圆环与 CEFR chip 已撤;CEFR 段配色 `CEFR_COLOR` 是数据编码色(青/蓝/紫/品红),不是品牌色。"下一分预估"用最新行的 lastUnitDone/nextAtUnit。分数是快变量,当天缺就缺,页面用最近一份兜底;2026-08-16~08-20 历史分数按单元进度回填(页面页脚注明)。
- 本地跑脚本需 `DUOLINGO_INSECURE=1`(python.org 安装缺 CA)+ `DUOLINGO_JWT` 环境变量;CI 不需要 INSECURE。

### 配置集中

`src/site.config.ts` 是域名/用户名/仓库名/giscus ID 的**唯一**维护点,前端组件和 scripts 下的构建脚本一律从这里 import,禁止散落硬编码。

### 样式体系

`src/index.css` 的 `@theme` design tokens + 语义化 class(`.card`/`.heading-gradient`/`.btn-primary` 等)。**页面里禁止手写重复长 className** —— 用 `src/components/ui.tsx` 的组件(Card/Tag/SectionTitle/NumberedSection 等)。品牌色只用 accent 系(cyan/violet),不裸写色值。

### 背景特效

`src/components/ParticleField.tsx`:全站 fixed canvas 星空(视差/流星/鼠标连线)。性能约束:DPR cap 2、离屏暂停(IntersectionObserver)、`prefers-reduced-motion` 降级为静态、移动端粒子减半。

## 内容红线

- **站点内容必须真实**:不编造文章/经历/数据。加占位内容前先问用户。
- **与用户工作相关的内容(如 TAPD)绝不访问、绝不上站**。
- git 身份:`~/code/github/` 下所有仓库通过 `~/.gitconfig` 的 `includeIf "gitdir:~/code/github/"` 引用 `~/.gitconfig-github`,自动使用 `Max Zhang <10436648+maxhello@users.noreply.github.com>`(2026-09-11 配置,替代原先的仓库级设置);全局默认身份是工作邮箱,**不要改全局默认 `user.*`**,也不要在本仓库再加仓库级 user 配置。提交前若发现作者不是 noreply 邮箱,先检查 includeIf 是否失效,不要直接改配置。推送走 SSH,账号由 SSH 密钥决定(当前为 maxhello)。
- commit message 不加 `Co-Authored-By: Claude` 行(用户明确要求)。
