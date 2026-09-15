# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git 提交纪律(最高优先级)

**只有在用户明确发话要求提交时,才允许 `git commit` / `git push`。**
完成代码改动后停下来汇报,等用户确认。绝不自动提交、绝不自动推送。
历史上有过自动 push 被权限系统拦截的先例 —— 不要重试被拦截的 push,询问用户。

## 项目概述

个人站点(https://maxhello.github.io):React 19 + Vite 6 + TypeScript + Tailwind CSS 4 + MDX 博客 + 英语学习数据面板。全静态,GitHub Pages 部署,无后端。

## 常用命令

```bash
npm run dev        # 开发服务器(启动前自动跑 data 脚本生成 repos.json / rss / sitemap)
npm run build      # tsc -b && vite build(先跑 prebuild → data 脚本)
npx vite preview   # 预览 dist
npm run test:py    # 多邻国脚本纯逻辑单测(stdlib unittest,零依赖)
python3 scripts/fetch-duolingo.py   # 手动跑多邻国采集(见下)
npm run guidebooks                  # 手动拉多邻国单元指南 → data/duolingo-guidebooks.json(需 DUOLINGO_JWT,本地加 DUOLINGO_INSECURE=1)
```

除 `test:py` 外没有测试、没有 lint。验证方式 = `npm run build` 通过 + `npm run test:py` 通过 + 本地预览。

## 架构

### 数据流(四条独立管道)

1. **构建时注入**:`prebuild` 跑 `npm run data` = `scripts/fetch-repos.ts`(拉仓库列表 → `src/data/repos.json`,gitignored,CI 用 `GITHUB_TOKEN`、本地匿名超限沿用旧文件)+ `scripts/gen-static.ts`(从 `content/posts` 生成 `public/rss.xml`/`sitemap.xml`/`robots.txt`,均 gitignored,域名取自 `site.config.ts`)。
2. **每日定时采集**:`.github/workflows/duolingo.yml` 每天 2 次(cron 写的是北京 09:13 / 23:13,**GitHub 定时实测漂移 3~5 小时**,实跑约 12~14 点和次日凌晨 2~4 点;2026-08-21 从 4 次精简,2026-09-11 晚班从 21:13 改 23:13)跑 `scripts/fetch-duolingo.py` → 更新 `data/duolingo-history.json` → 自动 commit(同日重跑覆盖,每天只留一条快照;**快照行的"今天"在北京凌晨 5 点前算前一天**(`snapshot_day()`/`DAY_ROLLOVER_HOUR`),所以漂到凌晨的晚班正好是前一天的收尾——2026-09-11 前按自然日归,把 9/8 晚学出来的 17 分记成了 9/9;傍晚后 xpGains 滞后的课由次日早班回填)。token 走 Secret `DUOLINGO_JWT`,**绝不进代码**,且必须由 workflow fetch step 的 `env:` 映射注入脚本——**漏了这行 CI 会静默退化成无明细模式**(2026-08-17 发现从建仓起就漏着,日明细一直靠本地跑续命;脚本已在 CI 缺 token 时直接报红防复发)。两个坑:
   - **snapshot 的 commit 不会触发 `on: push`**(GITHUB_TOKEN 推送防循环规则),部署靠 `deploy.yml` 的 `workflow_run` 监听 snapshot workflow 完成来触发;
   - **xpGains 对当天数据有数小时滞后**,白天手动跑可能缺当天明细(daily 里没有当天 key 时页面整行不展示——不做 totalXp 差值兜底,差值窗口横跨前一晚会把昨晚 XP 算成今天的),以 21:13 定时跑 + 次日 09:13 回填为准。
3. **博客内容**:`content/posts/*.mdx` 经 `import.meta.glob` eager 加载(`src/lib/posts.ts`)。**MDX 正文是 default export,不是命名 export**——这是曾导致文章页空白的坑。
4. **单元指南 + 学习路径页**(2026-09-15 起):`scripts/fetch-guidebooks.py`(`npm run guidebooks`,手动)拉多邻国 App 里每部分的"指南"→ `data/duolingo-guidebooks.json`(已提交,~400KB,**走动态 import 单独 chunk,只在 `/english/learn` 加载**,gzip ~70KB)。来源 `currentCourse.pathSectioned[].units[].guidebook.url`(CDN JSON,地址带哈希须先拿课程结构)。每单元存:`keySentences[]{en, zh(subtext 官方中文), tts(整句读音), words[]{w, hints[≤2], tts}}`(hints 来自 blockHints 的 hintTable,cell colspan>1 是词组释义;单字拆字释义有更长的就丢)+ `grammar[]{title, blocks[]{text|example{en,zh,tts}|table{rows}}}`。文本样式规律:fontSize 17 青色 = 分区标题,fontSize 25 加粗 = 语法点标题,其余正文,bold 片段保留 `**…**`。读音 mp3 公共前缀提到顶层 `ttsBase`,文件里只存哈希;CDN 公开可访问,浏览器 `new Audio()` 直接播。默认拉到当前 section 的下一段为止(现在 Intro+A1 共 70 单元),增量不重拉,`DUOLINGO_GUIDEBOOK_REFRESH=1` 全量、`DUOLINGO_GUIDEBOOK_SECTIONS=N` 指定段数。约一半单元没有语法点(70 里 32 有)。进入 A2 前手动跑一次,否则路径页该段显示"未缓存"。**不在 CI 定时跑**。
   消费方:`src/pages/Learn.tsx`(路由 `/english/learn`,参考多邻国 learn 页结构:顶部当前阶段横幅 + 蛇形节点路径 + 点节点开指南抽屉;进页在 useLayoutEffect 里 `scrollIntoView({behavior:'instant'})` 瞬时定位到当前节点(全站 html 是 smooth,不显式 instant 会看到往下滑);`?unit=<unitIndex>` 直接开某部分)+ `src/components/UnitGuide.tsx`(数据类型、`useGuidebooks()`、`UnitGuideBody`:句子喇叭读整句、点词弹释义并读该词、英文下中文)。样式在 index.css 的 learning path 区(`.btn-chunky/.path-banner/.path-node-*/.path-drawer`),**只借鉴布局交互,不用多邻国商标/配色/素材**。当前单元 = 最近一份带 `score.lastUnitDone` 的快照 + 1(`unitIndex` 是 API 的 0-based 全局编号;App 里"第 N 阶段第 M 部分" = `section+1` / `unitInSection`)。English 页不展示指南内容,入口 = CEFR journey 弧中心的段位文字整块是 Link("CURRENT LEVEL · OPEN PATH →"),不另开卡片。

### 多邻国数据的关键设计

- 数据源三层:公开接口(保底,无 token)+ JWT 下的 `xp_summaries`(按天 XP/课数/**真实学习秒数**,可回溯到开课第一天,2026-09-11 起是 `daily` 的正式来源;之前 daily 的分钟数是按课间隔估算的,普遍高估一到两成,历史已整体刷成接口值)+ JWT 下的逐课 `xpGains`(约 15 天窗口,只用来反推 unitDone/scoreReached)。xp_summaries 拉不到与 JWT 失效同样处理:直接 `exit 1` 报红,不静默提交。每次采集回看 `SUMMARY_DAYS`=45 天,一次性回填用环境变量 `DUOLINGO_SUMMARY_START=YYYY-MM-DD`。
- **档案是对象结构**(2026-08-20 从 list 改造,公共字段提升到外层):`{meta(静态身份: username/streakStart/learningLanguage), current(当前状态: sections/sessionCount/longestStreak/scoreMax,接口残缺时沿用旧值), days(纯时间序列: date/totalXp/streak/score/apiCoverage,一天一行,同日重跑覆盖), daily(近窗口流水账: {date: {lessons,minutes,xp}}), unitDone({unitIndex: 完成日}), scoreReached({分数: 到达日})}`。**unitDone/scoreReached 由逐课时间戳反推**(`extract_unit_progress()`:分数只在单元切换时跳变,完成时刻夹在本单元末课与下一单元首课之间;xpGains 每课带 `skillId` 对应单元,unit 130 起一个 skillId 跨多单元的不用),与采集时刻无关,**只增不改**(首次算出时窗口最全)。旧 list 文件由 `migrate()` 自动升级。消费方:本仓库 English.tsx / Now.tsx,以及 maxhello/maxhello 的 badge(读 `days[-1]` 的 date/streak/totalXp,已做双格式兼容)。
- **`xpGains` 是滚动窗口(约 15 天,按时间戳不按天)**:脚本必须把新拉到的天与档案 `daily` **合并**,同日冲突**保留 lessons 更多的一份**——窗口最老的那天重拉时只剩"边界时刻之后"的课,直接新覆盖旧会把完整日写成残缺日(2026-08-20 实锤:上午重跑把 8/5 从 18 课覆盖成 9 课)。此逻辑在 `fetch-duolingo.py` 的 `merge_history()`(有单测锁行为:`scripts/test_fetch_duolingo.py`)。
- **归日时区固定 `Asia/Shanghai`**(`TZ` 常量 + `day_key()`),不随运行环境变——本地(UTC+8)和 CI(UTC)结果必须一致。
- **防膨胀**:`daily` 全量住顶层(近 15 天窗口,滑出的天靠合并保留);`current` 状态字段只有一份;`unitDone` 每完成一个单元加一行,量级可忽略。文件一年 ~85KB 且全部进前端 bundle,别往 days 行塞每天不变的字段。
- **JWT 设置了但拉取失败(如过期)直接 `exit 1`**,让 workflow 变红,绝不静默提交没有明细的快照。
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
