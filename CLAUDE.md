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
```

除 `test:py` 外没有测试、没有 lint。验证方式 = `npm run build` 通过 + `npm run test:py` 通过 + 本地预览。

## 架构

### 数据流(三条独立管道)

1. **构建时注入**:`prebuild` 跑 `npm run data` = `scripts/fetch-repos.ts`(拉仓库列表 → `src/data/repos.json`,gitignored,CI 用 `GITHUB_TOKEN`、本地匿名超限沿用旧文件)+ `scripts/gen-static.ts`(从 `content/posts` 生成 `public/rss.xml`/`sitemap.xml`/`robots.txt`,均 gitignored,域名取自 `site.config.ts`)。
2. **每日定时采集**:`.github/workflows/duolingo.yml` 每天 2 次(北京 09:13 / 21:13;2026-08-21 从 4 次精简)跑 `scripts/fetch-duolingo.py` → 更新 `data/duolingo-history.json` → 自动 commit(同日重跑覆盖,每天只留一条快照,以 21:13 那次为当天收尾;傍晚后 xpGains 滞后的课由次日 09:13 回填)。token 走 Secret `DUOLINGO_JWT`,**绝不进代码**,且必须由 workflow fetch step 的 `env:` 映射注入脚本——**漏了这行 CI 会静默退化成无明细模式**(2026-08-17 发现从建仓起就漏着,日明细一直靠本地跑续命;脚本已在 CI 缺 token 时直接报红防复发)。两个坑:
   - **snapshot 的 commit 不会触发 `on: push`**(GITHUB_TOKEN 推送防循环规则),部署靠 `deploy.yml` 的 `workflow_run` 监听 snapshot workflow 完成来触发;
   - **xpGains 对当天数据有数小时滞后**,白天手动跑可能缺当天明细(daily 里没有当天 key 时页面整行不展示——不做 totalXp 差值兜底,差值窗口横跨前一晚会把昨晚 XP 算成今天的),以 21:13 定时跑 + 次日 09:13 回填为准。
3. **博客内容**:`content/posts/*.mdx` 经 `import.meta.glob` eager 加载(`src/lib/posts.ts`)。**MDX 正文是 default export,不是命名 export**——这是曾导致文章页空白的坑。

### 多邻国数据的关键设计

- 双级数据源:公开接口(保底,无 token)+ JWT 明细(逐课 xpGains)。
- **档案是对象结构**(2026-08-20 从 list 改造,公共字段提升到外层):`{meta(静态身份: username/streakStart/learningLanguage), current(当前状态: sections/sessionCount/longestStreak/scoreMax,接口残缺时沿用旧值), days(纯时间序列: date/totalXp/streak/score/apiCoverage,一天一行,同日重跑覆盖), daily(近窗口流水账: {date: {lessons,minutes,xp}})}`。旧 list 文件由 `migrate()` 自动升级。消费方:本仓库 English.tsx / Now.tsx,以及 maxhello/maxhello 的 badge(读 `days[-1]` 的 date/streak/totalXp,已做双格式兼容)。
- **`xpGains` 是滚动窗口(约 15 天,按时间戳不按天)**:脚本必须把新拉到的天与档案 `daily` **合并**,同日冲突**保留 lessons 更多的一份**——窗口最老的那天重拉时只剩"边界时刻之后"的课,直接新覆盖旧会把完整日写成残缺日(2026-08-20 实锤:上午重跑把 8/5 从 18 课覆盖成 9 课)。此逻辑在 `fetch-duolingo.py` 的 `merge_history()`(有单测锁行为:`scripts/test_fetch_duolingo.py`)。
- **归日时区固定 `Asia/Shanghai`**(`TZ` 常量 + `day_key()`),不随运行环境变——本地(UTC+8)和 CI(UTC)结果必须一致。
- **防膨胀**:`daily` 全量住顶层(近 15 天窗口,滑出的天靠合并保留);`current` 状态字段只有一份。文件一年 ~85KB 且全部进前端 bundle,别往 days 行塞每天不变的字段。
- **JWT 设置了但拉取失败(如过期)直接 `exit 1`**,让 workflow 变红,绝不静默提交没有明细的快照。
- **多邻国分数**:days 行的 `score` = `{reached, lastUnitDone, nextAtUnit}`,reached 来自 `currentCourse.scoreMetadata.reachedScore`(10~160,CEFR 对齐,接口原值),`lastUnitDone`/`nextAtUnit` 从 pathSectioned 算(最后完成单元、下一分单元带末单元),页面用它们做分数时间线和"下一分预估";满分在 `current.scoreMax`。分数是快变量,当天缺就缺,页面用最近一份兜底;2026-08-16~08-20 历史分数按单元进度回填(页面页脚注明)。
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
- git 身份:仓库级配置为 noreply 邮箱(`10436648+maxhello@users.noreply.github.com`),**不要改全局 git 配置**。
- commit message 不加 `Co-Authored-By: Claude` 行(用户明确要求)。
