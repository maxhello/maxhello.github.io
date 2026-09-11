import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import history from '../../data/duolingo-history.json'
import { Card, SectionTitle, SectionSubtitle } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

interface DayDetail {
  lessons: number
  minutes: number
  xp: number
}

interface Section {
  cefr: string | null
  unitsTotal: number
  unitsCompleted: number
  /** 该段覆盖的分数区间(2026-09-11 起采集;实测 A1 10~29、A2 30~59、B1 60~99、B2 100~128) */
  scoreMin?: number
  scoreMax?: number
}

interface ScoreInfo {
  reached: number
  lastUnitDone?: number
  /** 当前分数带的首单元(2026-09-11 起采集;老行没有,页面按首次出现该分数的行推) */
  bandStart?: number
  nextAtUnit?: number
}

/** days 数组元素:一天一行的纯时间序列 */
interface DayRow {
  date: string
  totalXp: number
  streak: number
  score?: ScoreInfo
  apiCoverage?: string
}

/** duolingo-history.json 顶层结构(2026-08-20 起:list → 对象) */
interface HistoryData {
  meta: { username?: string; streakStart?: string; learningLanguage?: string }
  current: {
    longestStreak?: number
    sessionCount?: number
    sections?: Section[]
    scoreMax?: number
  }
  days: DayRow[]
  daily?: Record<string, DayDetail>
  /** 完成单元 N 的日期(逐课时间戳反推,采集脚本只增不改) */
  unitDone?: Record<string, string>
  /** 到达 N 分的日期(同上)。days 行里的 score 只是采集时刻的瞬时值,时间线以这份为准 */
  scoreReached?: Record<string, string>
  /** 手工补充(脚本不写不改):接口没有的历史事实,来自本人回忆,来源写在 note 里 */
  manual?: {
    note?: string
    /** 进入某 CEFR 段的日期(定级测试直接落在段内时,scoreReached 里没有段起始分) */
    levelEntered?: Record<string, string>
    /** 由定级测试直接标完成、未实际学习的段 */
    placedLevels?: string[]
  }
}

const hist = history as HistoryData
const rows = hist.days
const latest = rows[rows.length - 1]
const first = rows[0]
const current = hist.current

/** 访客本地日期(不能 toISOString:那是 UTC,北京时间早上 8 点前还是"昨天") */
function localIsoDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const todayIso = localIsoDate()

/** 每日明细只认 daily(xpGains 归日生成)。当天 key 要等明细同步才有 —— 没有就整行不展示,不用 totalXp 差值兜底(差值窗口横跨前一晚,会把昨晚的 XP 算成今天的) */
const days = Object.entries(hist.daily ?? {})
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, v]) => ({ date, ...v }))
const byDate = new Map(days.map((d) => [d.date, d]))

const activeDays = days.filter((d) => d.xp > 0)
const daysWithMinutes = days.filter((d) => d.minutes > 0)
const totalMinutes = daysWithMinutes.reduce((s, d) => s + d.minutes, 0)
const avgMinutes = daysWithMinutes.length ? Math.round(totalMinutes / daysWithMinutes.length) : 0
const bestDay = activeDays.reduce<typeof days[number] | null>(
  (best, d) => (!best || d.xp > best.xp ? d : best),
  null,
)
const last7 = days.slice(-7)
const weekMinutes = last7.reduce((s, d) => s + d.minutes, 0)
const weekXp = last7.reduce((s, d) => s + d.xp, 0)
const todayDetail = byDate.get(todayIso)

/** 绿墙日历序列:对齐到周一列首,首尾与中间缺口补 0-XP 灰格(采集缺天不再错位整列周几) */
const wallDays = (() => {
  if (days.length === 0) return []
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const cur = new Date(days[0].date + 'T00:00:00')
  cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7)) // 回退到本周周一
  const end = new Date(days[days.length - 1].date + 'T00:00:00')
  const out: typeof days = []
  while (cur <= end) {
    const k = iso(cur)
    out.push(byDate.get(k) ?? { date: k, lessons: 0, minutes: 0, xp: 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return out
})()

/** 绿墙行标签:第 1/3/5 行(Mon/Wed/Fri),GitHub 式 */
const WALL_ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']

/* —— 多邻国分数(10~160,CEFR 对齐,随课程进度/关卡测量浮动)—— */
const scoreSnaps = rows.filter((s) => s.score?.reached != null)
const scoreLatest = scoreSnaps[scoreSnaps.length - 1]
const scoreNow = scoreLatest?.score?.reached
const scoreMax = current.scoreMax
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** 各档首次出现在快照里的日期:采集时刻所在日,可能比真实到达晚一天(定时任务漂到凌晨才跑) */
const scoreFirstSeen = scoreSnaps.reduce<Record<number, string>>((acc, s) => {
  const v = s.score!.reached
  if (acc[v] == null) acc[v] = s.date
  return acc
}, {})
const scoreReached = hist.scoreReached ?? {}

/** 分数时间线:每档到达日 + 进入该档用了几天。
 *  到达日优先取 scoreReached(逐课时间戳反推,精确到当天),没有的档退回快照首见日。
 *  首档之前没数据,exact=false 表示天数只是下限 */
const scoreTimeline = Array.from(
  new Set([...Object.keys(scoreFirstSeen), ...Object.keys(scoreReached)].map(Number)),
)
  .filter((v) => scoreNow == null || v <= scoreNow)
  .sort((a, b) => a - b)
  .reduce<
    { score: number; since: string; tookDays: number | null; exact: boolean }[]
  >((acc, v) => {
    const precise = scoreReached[String(v)]
    const since = precise ?? scoreFirstSeen[v]
    if (!since) return acc
    const prev = acc[acc.length - 1]
    acc.push({
      score: v,
      since,
      tookDays: prev ? dayDiff(prev.since, since) : null,
      // 上一档是"开记录时就已到达"的首档时,间隔天数不可知确切值
      exact: acc.length >= 2,
    })
    return acc
  }, [])

/** 下一分预估:剩余单元 ÷ 有记录以来的单元推进速度,外加本档进度(done/total 单元)。
 *  数据不足/已满分时为 null,页面降级 */
const scoreEta = (() => {
  const last = scoreSnaps[scoreSnaps.length - 1]
  const lastUnit = last?.score?.lastUnitDone
  const nextUnit = last?.score?.nextAtUnit
  if (lastUnit == null || nextUnit == null) return null
  const remaining = nextUnit - lastUnit
  if (remaining <= 0) return null
  // 本档首单元:新行直接带;老行退回"首次出现当前分数那行的 lastUnitDone + 1"
  const firstAtScore = scoreSnaps.find((s) => s.score!.reached === last.score!.reached)
  const bandStart = Math.min(
    last.score!.bandStart ?? (firstAtScore?.score?.lastUnitDone ?? lastUnit) + 1,
    lastUnit + 1,
  )
  const band = { done: lastUnit - bandStart + 1, total: nextUnit - bandStart + 1 }
  const withUnits = rows.filter((s) => s.score?.lastUnitDone != null)
  const first = withUnits[0]
  const firstUnit = first?.score?.lastUnitDone
  if (firstUnit == null) return null
  const span = dayDiff(first.date, last.date)
  const gained = lastUnit - firstUnit
  if (span < 1 || gained <= 0) return null
  const pace = gained / span
  const etaDays = Math.max(1, Math.round(remaining / pace))
  const etaDate = new Date(Date.parse(last.date) + etaDays * 86_400_000)
  return {
    target: (last.score!.reached ?? 0) + 1,
    remaining,
    band,
    pace,
    date: etaDate.toISOString().slice(0, 10),
    dateLabel: etaDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
})()

/** CEFR 段:合并同名段 */
interface Level {
  cefr: string
  total: number
  done: number
  scoreMin?: number
  scoreMax?: number
}

/** CEFR 段配色:数据编码色,按段固定不随排序变(Intro 暗青 → A1 青 → A2 蓝 → B1 紫 → B2 品红) */
const CEFR_COLOR: Record<string, string> = {
  Intro: '#155e75',
  A1: '#22d3ee',
  A2: '#60a5fa',
  B1: '#a78bfa',
  B2: '#e879f9',
}
const cefrColor = (cefr: string) => CEFR_COLOR[cefr] ?? '#a78bfa'

/** 按 CEFR 名合并接口里的分段(A1/B1/B2 各拆成两段),单元数相加、分数区间取并 */
function cefrSections(): Level[] {
  const raw = (current.sections ?? []).filter((s) => s.cefr)
  const merged = new Map<string, Level>()
  for (const s of raw) {
    const cur = merged.get(s.cefr!) ?? { cefr: s.cefr!, total: 0, done: 0 }
    cur.total += s.unitsTotal
    cur.done += s.unitsCompleted
    if (s.scoreMin != null) cur.scoreMin = Math.min(cur.scoreMin ?? s.scoreMin, s.scoreMin)
    if (s.scoreMax != null) cur.scoreMax = Math.max(cur.scoreMax ?? s.scoreMax, s.scoreMax)
    merged.set(s.cefr!, cur)
  }
  return [...merged.values()]
}
const levels = cefrSections()

/** 当前段:分数落在其区间内的段;没有分数时退回第一个未完成的段 */
const levelNow =
  levels.find(
    (l) =>
      scoreNow != null && l.scoreMin != null && l.scoreMax != null && scoreNow >= l.scoreMin && scoreNow <= l.scoreMax,
  ) ??
  levels.find((l) => l.done < l.total) ??
  null
const levelNext = levelNow ? (levels[levels.indexOf(levelNow) + 1] ?? null) : null

/** 进入当前段的日期:段起始分的到达日(A2 起精确)→ 手工记录的进段日(定级直接落在段内,如 A1 自 07-27)
 *  → 都没有则退回最早落在段内的快照日(approx,文案带 +) */
const levelSince = (() => {
  if (!levelNow || levelNow.scoreMin == null || levelNow.scoreMax == null) return null
  const exact = scoreReached[String(levelNow.scoreMin)] ?? hist.manual?.levelEntered?.[levelNow.cefr]
  if (exact) return { date: exact, approx: false }
  const row = scoreSnaps.find(
    (s) => s.score!.reached >= levelNow.scoreMin! && s.score!.reached <= levelNow.scoreMax!,
  )
  return row ? { date: row.date, approx: true } : null
})()

/** 当前段内的升分点(走势图只画这些) */
const levelSteps = scoreTimeline.filter(
  (t) =>
    levelNow?.scoreMin != null && levelNow.scoreMax != null && t.score >= levelNow.scoreMin && t.score <= levelNow.scoreMax,
)

/** 数字滚动动画 */
function useCountUp(target: number, ms = 900): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3)))) // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return n
}

/** 当前段预计完成日:剩余单元 ÷ 单元推进速度(与下一分预估同款 pace) */
function sectionEta(s: { total: number; done: number }): string | null {
  if (!scoreEta || s.total <= s.done) return null
  const daysLeft = Math.max(1, Math.round((s.total - s.done) / scoreEta.pace))
  const d = new Date(Date.parse(latest.date) + daysLeft * 86_400_000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** 首屏入场:挂载后延迟置 true,配合 CSS transition 做描边生长/淡入;reduced-motion 时由 motion-reduce 类直接呈现 */
function useMounted(delay = 150): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return on
}

/** Hero 中栏:当前 CEFR 段内的分数走势(AtCoder 评分图的画法)。
 *  纵轴 = 当前段的分数区间(A1 10~30),背景铺本段色带、顶上一条下一段的提示带;
 *  只画本段内的升分点,进 A2 后自动换区间。最后一点停在发生日并带光晕,不往今天拖。
 *  下方文案:在本段第几天(A1 早于建档,天数是下限,带 +)、本段升了几次 */
function ScoreBandChart() {
  const [hover, setHover] = useState<number | null>(null)
  const on = useMounted()
  const ref = useRef<SVGSVGElement>(null)
  const gid = useId()
  if (!levelNow || levelNow.scoreMin == null || levelNow.scoreMax == null || levelSteps.length === 0)
    return null
  const steps = levelSteps
  const W = 300
  const H = 150
  const L = 12
  const R = 40
  const T = 14
  const B = 20
  const yMin = levelNow.scoreMin
  const yMax = levelNow.scoreMax + 1 // 上沿 = 下一段起始分
  const x0 = Date.parse(steps[0].since)
  const x1 = Date.parse(steps[steps.length - 1].since)
  const plotW = W - L - R
  const px = (d: string) => (x1 === x0 ? L + plotW / 2 : L + ((Date.parse(d) - x0) / (x1 - x0)) * plotW)
  const py = (v: number) => H - B - ((v - yMin) / (yMax - yMin)) * (H - T - B)
  const pts = steps.map((t) => [px(t.since), py(t.score)] as const)
  const line = pts.map(([x, y]) => `${x},${y}`).join(' L ')
  const length = pts.reduce(
    (acc, [x, y], i) => (i ? acc + Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]) : 0),
    0,
  )
  const color = cefrColor(levelNow.cefr)
  const nextColor = levelNext ? cefrColor(levelNext.cefr) : '#a78bfa'
  const tickStep = yMax - yMin <= 20 ? 5 : 10
  const ticks: number[] = []
  for (let v = yMin; v <= yMax; v += tickStep) ticks.push(v)
  if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax)
  // 相邻点横向不到 14px 时标签放点右侧,错开不叠字(最低点贴基线,不能放下方)
  const aside: boolean[] = []
  pts.forEach(([x], i) => {
    const close = i > 0 && x - pts[i - 1][0] < 14
    aside.push(close && !aside[i - 1])
  })
  const locate = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((clientX - rect.left) / rect.width) * W
    let best = 0
    pts.forEach(([ptx], i) => {
      if (Math.abs(ptx - x) < Math.abs(pts[best][0] - x)) best = i
    })
    setHover(Math.abs(pts[best][0] - x) <= 24 ? best : null)
  }
  const h = hover !== null ? steps[hover] : null
  const dayN = levelSince ? dayDiff(levelSince.date, todayIso) + 1 : null

  return (
    <div className="flex w-full min-w-0 max-w-[340px] flex-col items-center gap-1 justify-self-center">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Duolingo score within ${levelNow.cefr}`}
        style={{ touchAction: 'pan-y' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => locate(e.clientX)}
        onTouchStart={(e) => locate(e.touches[0].clientX)}
        onTouchMove={(e) => locate(e.touches[0].clientX)}
      >
        <defs>
          <linearGradient id={`${gid}-s`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          <filter id={`${gid}-g`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        {/* 本段色带:下半深、上半浅;顶上一条下一段提示带 */}
        <rect x={L} y={py((yMin + yMax) / 2)} width={plotW + 6} height={py(yMin) - py((yMin + yMax) / 2)} fill={color} opacity="0.22" />
        <rect x={L} y={py(yMax)} width={plotW + 6} height={py((yMin + yMax) / 2) - py(yMax)} fill={color} opacity="0.1" />
        {levelNext && (
          <>
            <rect x={L} y={T - 8} width={plotW + 6} height={8} fill={nextColor} opacity="0.35" />
            <text x={L + 4} y={T - 2} fontSize="8" fontWeight="bold" fill={nextColor}>
              {levelNext.cefr} ↑
            </text>
          </>
        )}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} y1={py(v)} x2={W - R + 6} y2={py(v)} stroke="#fff" opacity="0.06" />
            <text x={W - R + 10} y={py(v) + 3} fontSize="8" fontFamily="ui-monospace, monospace" className="fill-gray-500">
              {v}
            </text>
          </g>
        ))}
        <text x={W - R + 10} y={py((yMin + yMax) / 2) - 9} fontSize="9" fontWeight="bold" fill={color}>
          {levelNow.cefr}
        </text>
        {/* 折线(描边生长)+ 点 + 标签(依次浮现) */}
        {pts.length > 1 && (
          <path
            d={`M ${line}`}
            fill="none"
            stroke={`url(#${gid}-s)`}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={on ? 0 : length}
            className="motion-reduce:transition-none"
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }}
          />
        )}
        {steps.map((t, i) => {
          const last = i === steps.length - 1
          const [x, y] = pts[i]
          return (
            <g
              key={t.score}
              className="transition-opacity duration-500 motion-reduce:transition-none"
              style={{ opacity: on ? 1 : 0, transitionDelay: `${(i / Math.max(1, steps.length - 1)) * 1000}ms` }}
            >
              {last && (
                <>
                  <circle cx={x} cy={y} r="8" fill="#a78bfa" opacity="0.5" filter={`url(#${gid}-g)`} />
                  <circle
                    cx={x}
                    cy={y}
                    r="4"
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="1.5"
                    className="animate-ping motion-reduce:animate-none"
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  />
                </>
              )}
              <circle
                cx={x}
                cy={y}
                r={last ? 4 : hover === i ? 3.5 : 2.5}
                fill={last ? '#c4b5fd' : color}
                stroke="#0b1220"
                strokeWidth="1"
              />
              <text
                x={x + (aside[i] ? 6 : 0)}
                y={y + (aside[i] ? 3 : -8)}
                fontSize={last ? 10 : 8}
                fontWeight={last ? 'bold' : 'normal'}
                textAnchor={aside[i] ? 'start' : 'middle'}
                fontFamily="ui-monospace, monospace"
                className={last ? 'fill-violet-200' : 'fill-gray-400'}
              >
                {t.score}
              </text>
            </g>
          )
        })}
        <line x1={L} y1={H - B} x2={W - R + 6} y2={H - B} className="stroke-gray-700" />
        <text x={L} y={H - 7} fontSize="8" className="fill-gray-500">
          {fmtDate(steps[0].since)}
        </text>
        {steps.length > 1 && (
          <text x={pts[pts.length - 1][0]} y={H - 7} fontSize="8" textAnchor="end" className="fill-gray-500">
            {fmtDate(steps[steps.length - 1].since)}
          </text>
        )}
        {h && (
          <g>
            <line x1={px(h.since)} y1={T - 6} x2={px(h.since)} y2={H - B} stroke="#67e8f9" strokeWidth="1" strokeOpacity="0.5" />
            {(() => {
              const bw = 78
              const bx = Math.min(Math.max(px(h.since) - bw / 2, 2), W - bw - 2)
              const took = h.tookDays != null ? `${h.exact ? '' : '≥'}${h.tookDays}d` : 'tracking start'
              return (
                <g>
                  <rect x={bx} y={0} width={bw} height={30} rx={5} fill="#0b1220" stroke="rgb(55 65 81)" />
                  <text x={bx + bw / 2} y={12} textAnchor="middle" fontSize="9" fill="#22d3ee">
                    {h.score} · {fmtDate(h.since)}
                  </text>
                  <text x={bx + bw / 2} y={24} textAnchor="middle" fontSize="9" fill="#9ca3af">
                    {took}
                  </text>
                </g>
              )
            })()}
          </g>
        )}
      </svg>
      <div className="text-[11px] text-gray-500">
        <span className="font-semibold" style={{ color }}>
          {levelNow.cefr}
        </span>
        {dayN != null && (
          <>
            {' · day '}
            <span className="font-mono text-gray-200">
              {dayN}
              {levelSince?.approx ? '+' : ''}
            </span>
          </>
        )}
        {` · ${steps.length} score-up${steps.length > 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

/** Hero 右栏:段位徽章(Valorant 段位的画法)。六边形里写当前段与分数,
 *  外环按本档单元数分格、已完成的格子亮起(= 到下一分的进度),下方一行下一分预估 */
function ScoreBadge() {
  const on = useMounted(400)
  const gid = useId()
  if (scoreNow == null) return null
  const W = 210
  const H = 172
  const cx = 105
  const cy = 82
  const R = 66
  const circ = 2 * Math.PI * R
  const band = scoreEta?.band ?? null
  const segs = band ? band.total : 1
  const seg = circ / segs
  const gap = segs > 1 ? 5 : 0
  const hex = (r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (i * Math.PI) / 3
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    }).join(' ')
  const cefr = levelNow?.cefr
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-[184px] max-w-full overflow-visible" role="img" aria-label={`Duolingo score ${scoreNow}`}>
        <defs>
          <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          <radialGradient id={`${gid}-f`}>
            <stop offset="0%" stopColor="#1e2a4a" />
            <stop offset="100%" stopColor="#0b1220" />
          </radialGradient>
          <filter id={`${gid}-b`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {/* 环底轨:按本档单元数分格 */}
        {Array.from({ length: segs }, (_, i) => (
          <circle
            key={`t-${i}`}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            className="stroke-gray-800"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${seg - gap} ${circ}`}
            strokeDashoffset={-(i * seg)}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        {/* 已完成的格子:渐变 + 光晕,依次亮起 */}
        {band &&
          Array.from({ length: band.done }, (_, i) => (
            <g
              key={`d-${i}`}
              className="transition-opacity duration-500 motion-reduce:transition-none"
              style={{ opacity: on ? 1 : 0, transitionDelay: `${i * 150}ms` }}
            >
              <circle cx={cx} cy={cy} r={R} fill="none" stroke={`url(#${gid}-g)`} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${seg - gap} ${circ}`} strokeDashoffset={-(i * seg)} transform={`rotate(-90 ${cx} ${cy})`} filter={`url(#${gid}-b)`} opacity="0.7" />
              <circle cx={cx} cy={cy} r={R} fill="none" stroke={`url(#${gid}-g)`} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${seg - gap} ${circ}`} strokeDashoffset={-(i * seg)} transform={`rotate(-90 ${cx} ${cy})`} />
            </g>
          ))}
        {/* 徽章 */}
        <polygon points={hex(46)} fill={`url(#${gid}-f)`} stroke={`url(#${gid}-g)`} strokeWidth="2" />
        <polygon points={hex(39)} fill="none" stroke="#22d3ee" strokeWidth="0.6" opacity="0.5" />
        {cefr && (
          <text x={cx} y={cy - 17} textAnchor="middle" fontSize="10" fontWeight="bold" fill={cefrColor(cefr)} letterSpacing="2.5">
            {cefr}
          </text>
        )}
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="34" fontWeight="800" fill="#fff" letterSpacing="-1">
          {scoreNow}
        </text>
        <text x={cx} y={cy + 29} textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" className="fill-gray-500">
          / {scoreMax ?? '—'}
        </text>
        <text x={cx} y={cy + R + 16} textAnchor="middle" fontSize="8.5" letterSpacing="1.5" className="fill-gray-500">
          DUOLINGO SCORE{band && scoreEta ? ` · ${band.done}/${band.total} TO ${scoreEta.target}` : ''}
        </text>
      </svg>
      <div className="text-[11px] text-gray-500">
        {scoreEta ? (
          <>
            next <span className="font-mono text-violet-300">{scoreEta.target}</span>
            {` · ${scoreEta.remaining} unit${scoreEta.remaining > 1 ? 's' : ''} · ≈ ${scoreEta.dateLabel}`}
          </>
        ) : (
          scoreTimeline.length > 0 && `reached ${fmtDate(scoreTimeline[scoreTimeline.length - 1].since)}`
        )}
      </div>
    </div>
  )
}

/** CEFR journey:五段等宽半圆弧,每段亮起的比例 = 该段单元完成度(Intro 全亮、A1 亮 37%、其余暗),
 *  亮起末端带光晕脉冲;中心写当前段、完成度、剩余单元与 ETA。只讲课程进度,不放分数 */
function CefrArc() {
  const on = useMounted(200)
  const gid = useId()
  if (levels.length === 0) return null
  const W = 420
  const H = 235
  const cx = 210
  const cy = 200
  const R = 160
  const w = 22
  const n = levels.length
  const GAP = 0.035
  const span = (Math.PI - GAP * (n - 1)) / n
  const pt = (a: number, r: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  const arc = (a: number, b: number) => {
    const [x1, y1] = pt(a, R)
    const [x2, y2] = pt(b, R)
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`
  }
  const totalUnits = levels.reduce((s, l) => s + l.total, 0)
  const doneUnits = levels.reduce((s, l) => s + l.done, 0)
  const coursePct = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0
  const cur = levelNow
  const curPct = cur && cur.total > 0 ? Math.round((cur.done / cur.total) * 100) : 0
  const eta = cur ? sectionEta(cur) : null
  let tip: readonly [number, number] | null = null
  let tipColor = '#22d3ee'
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px] overflow-visible" role="img" aria-label="CEFR journey">
        <defs>
          <filter id={`${gid}-g`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {levels.map((l, i) => {
          const a0 = Math.PI + i * (span + GAP)
          const a1 = a0 + span
          const pct = l.total > 0 ? l.done / l.total : 0
          const color = cefrColor(l.cefr)
          const placed = hist.manual?.placedLevels?.includes(l.cefr) ?? false
          const isCur = pct > 0 && pct < 1
          if (isCur) {
            tip = pt(a0 + span * pct, R)
            tipColor = color
          }
          const mid = (a0 + a1) / 2
          const edge = i === 0 ? 'end' : i === n - 1 ? 'start' : 'middle'
          const [lx, ly] = pt(mid, edge === 'middle' ? R + 24 : R + 18)
          const [ux, uy] = pt(mid, R - w / 2 - 12)
          return (
            <g key={l.cefr}>
              <path d={arc(a0, a1)} fill="none" stroke={color} strokeWidth={w} opacity="0.16" />
              {pct > 0 && (
                <path
                  d={arc(a0, a0 + span * pct)}
                  fill="none"
                  stroke={color}
                  strokeWidth={w}
                  className="transition-opacity duration-700 motion-reduce:transition-none"
                  style={{ opacity: on ? (pct === 1 ? 0.75 : 1) : 0, transitionDelay: `${i * 120}ms` }}
                />
              )}
              <text x={lx} y={ly + 4} textAnchor={edge} fontSize="12" fontWeight="bold" letterSpacing="0.5" fill={pct > 0 ? color : '#6b7280'}>
                {l.cefr}
              </text>
              <text x={ux} y={uy + 4} textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" className={pct > 0 ? 'fill-gray-400' : 'fill-gray-600'}>
                {pct === 1 ? (placed ? 'placed' : 'done') : `${l.done}/${l.total}`}
              </text>
            </g>
          )
        })}
        {tip && (
          <g className="transition-opacity duration-700 motion-reduce:transition-none" style={{ opacity: on ? 1 : 0, transitionDelay: '500ms' }}>
            <circle cx={tip[0]} cy={tip[1]} r="9" fill={tipColor} opacity="0.5" filter={`url(#${gid}-g)`} />
            <circle
              cx={tip[0]}
              cy={tip[1]}
              r="6"
              fill={tipColor}
              className="animate-ping motion-reduce:animate-none"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            <circle cx={tip[0]} cy={tip[1]} r="4.5" fill="#fff" />
          </g>
        )}
        {cur && (
          <>
            <text x={cx} y={cy - 58} textAnchor="middle" fontSize="44" fontWeight="800" letterSpacing="-1" fill={cefrColor(cur.cefr)}>
              {cur.cefr}
            </text>
            <text x={cx} y={cy - 36} textAnchor="middle" fontSize="12" fontFamily="ui-monospace, monospace" className="fill-gray-400">
              {cur.done} / {cur.total} units · {curPct}%
            </text>
            <text x={cx} y={cy - 18} textAnchor="middle" fontSize="9" letterSpacing="2" className="fill-gray-500">
              CURRENT LEVEL
            </text>
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="10" className="fill-gray-400">
              {cur.total - cur.done} units to go{eta ? ` · ETA ${eta}` : ''}
            </text>
          </>
        )}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-gray-400">
        <span>
          Course <b className="font-semibold text-gray-200">{doneUnits} / {totalUnits}</b> units · {coursePct}%
        </span>
        <span>
          {levels
            .filter((l) => l.done > 0)
            .map((l, i) => (
              <span key={l.cefr}>
                {i > 0 && ' · '}
                {l.cefr}{' '}
                <b className="font-semibold text-gray-200">
                  {l.done >= l.total
                    ? hist.manual?.placedLevels?.includes(l.cefr)
                      ? 'placed'
                      : 'done'
                    : `${l.done}/${l.total}`}
                </b>
              </span>
            ))}
        </span>
      </div>
    </div>
  )
}

/** 渐变面积图:最近 30 天,XP 面积 + 时长折线,悬停十字线 */
function DailyChart() {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const view = days.slice(-30)
  const W = 660
  const H = 190
  const PAD = 10
  const maxXp = Math.max(50, ...view.map((d) => d.xp))
  const maxMin = Math.max(30, ...view.map((d) => d.minutes))
  const bw = W / view.length
  const px = (i: number) => i * bw + bw / 2
  // X 轴标签密度:每个标签约占 46px 宽,按天数抽稀
  const xLabelEvery = Math.max(1, Math.ceil(view.length / (W / 46)))
  const pyXp = (v: number) => H - PAD - (v / maxXp) * (H - PAD * 2)
  const pyMin = (v: number) => H - PAD - (v / maxMin) * (H - PAD * 2)

  const areaPath =
    `M ${px(0)},${pyXp(view[0].xp)} ` +
    view.map((d, i) => `L ${px(i)},${pyXp(d.xp)}`).join(' ') +
    ` L ${px(view.length - 1)},${H - PAD} L ${px(0)},${H - PAD} Z`
  const linePath = view.map((d, i) => `${px(i)},${pyMin(d.minutes)}`).join(' L ')
  const hoverD = hover !== null ? view[hover] : null

  /** 指针/手指横坐标 → 天索引,越界置空(鼠标与触屏共用) */
  const locate = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((clientX - rect.left) / rect.width) * W
    const i = Math.floor(x / bw)
    setHover(i >= 0 && i < view.length ? i : null)
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Daily XP and minutes"
      style={{ touchAction: 'pan-y' }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => locate(e.clientX)}
      onTouchStart={(e) => locate(e.touches[0].clientX)}
      onTouchMove={(e) => locate(e.touches[0].clientX)}
    >
      <defs>
        <linearGradient id="xpArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* XP 面积 + 顶线 */}
      <path d={areaPath} fill="url(#xpArea)" />
      <path
        d={`M ${view.map((d, i) => `${px(i)},${pyXp(d.xp)}`).join(' L ')}`}
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* 分钟折线 */}
      <path
        d={`M ${linePath}`}
        fill="none"
        stroke="#a78bfa"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      {/* 悬停十字线 + 浮动数据卡 */}
      {hoverD && (
        <g>
          <line
            x1={px(hover!)}
            y1={PAD}
            x2={px(hover!)}
            y2={H - PAD}
            stroke="#67e8f9"
            strokeWidth="1"
            strokeOpacity="0.5"
          />
          <circle cx={px(hover!)} cy={pyXp(hoverD.xp)} r="4" fill="#22d3ee" />
          <circle cx={px(hover!)} cy={pyMin(hoverD.minutes)} r="3.5" fill="#a78bfa" />
          {/* 浮动卡:靠边翻转,避免出界 */}
          {(() => {
            const cx = px(hover!)
            const bw2 = 62
            const bx = Math.min(Math.max(cx - bw2 / 2, 2), W - bw2 - 2)
            return (
              <g>
                <rect
                  x={bx}
                  y={6}
                  width={bw2}
                  height={54}
                  rx={5}
                  fill="#0b1220"
                  stroke="rgb(55 65 81)"
                />
                <text x={bx + bw2 / 2} y={22} textAnchor="middle" fontSize="10" fill="#9ca3af">
                  {hoverD.date.slice(5)}
                </text>
                <text x={bx + 10} y={38} fontSize="10" fill="#22d3ee">
                  {hoverD.xp} XP
                </text>
                <text x={bx + 10} y={52} fontSize="10" fill="#a78bfa">
                  {hoverD.minutes}m · {hoverD.lessons}课
                </text>
              </g>
            )
          })()}
        </g>
      )}
      <line x1={0} y1={H - PAD} x2={W} y2={H - PAD} className="stroke-gray-700" strokeWidth="1" />
      {/* X 轴日期:隔 N 天标一个,每天画小刻度 */}
      {view.map((d, i) => (
        <g key={`x-${d.date}`}>
          <line
            x1={px(i)}
            y1={H - PAD}
            x2={px(i)}
            y2={H - PAD + 3}
            className="stroke-gray-600"
            strokeWidth="1"
          />
          {i % xLabelEvery === 0 && (
            <text
              x={px(i)}
              y={H - 2}
              textAnchor="middle"
              fontSize="9"
              className="fill-gray-500"
            >
              {d.date.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card className="text-center">
      <div className="text-2xl font-bold heading-gradient">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </Card>
  )
}

/** 打卡绿墙:日历周对齐(周一起始),列数无上限;初始滚动到最右(最新一周),更早的向左滑查看 */
function ActivityWall() {
  const scrollRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth // 绘制前锚定右端,避免先渲染最老几周再跳
  }, [])
  if (wallDays.length === 0) return null
  return (
    <div className="flex gap-2">
      <div className="flex shrink-0 flex-col gap-1 text-[9px] leading-none text-gray-600">
        {WALL_ROW_LABELS.map((l, i) => (
          <span key={i} className="flex h-3.5 items-center">
            {l}
          </span>
        ))}
      </div>
      <div ref={scrollRef} className="flex gap-1 overflow-x-auto pb-1">
        {Array.from({ length: Math.ceil(wallDays.length / 7) }, (_, w) => (
          <div key={w} className="flex flex-col gap-1">
            {wallDays.slice(w * 7, w * 7 + 7).map((d) => {
              const lvl =
                d.xp <= 0
                  ? 'bg-gray-800'
                  : d.xp < 200
                    ? 'bg-emerald-900'
                    : d.xp < 500
                      ? 'bg-emerald-700'
                      : d.xp < 800
                        ? 'bg-emerald-500'
                        : 'bg-emerald-300'
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.xp} XP, ${d.minutes} min`}
                  className={`size-3.5 rounded-sm transition-transform hover:scale-150 ${lvl} ${
                    d.date === todayIso ? 'animate-pulse ring-1 ring-cyan-300' : ''
                  }`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function English() {
  usePageTitle('English')
  const streakN = useCountUp(latest?.streak ?? 0)
  if (!latest) {
    return (
      <div>
        <SectionTitle>English Learning</SectionTitle>
        <p className="mt-4 text-gray-400">No data yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>English Learning</SectionTitle>
        <SectionSubtitle>
          Daily Duolingo snapshots — auto-updated. Tracked since {days[0]?.date ?? first.date}.
        </SectionSubtitle>
      </div>

      {/* Hero 三栏:今日数据 · 当前段分数走势 · 段位徽章(手机端竖排) */}
      <Card className="grid items-center gap-5 p-6 sm:grid-cols-[12rem_minmax(0,1fr)_11.5rem]">
        <div className="text-center sm:text-left">
          <div className="font-mono text-xs text-gray-500">TODAY · {todayIso}</div>
          <div className="mt-2 flex items-baseline justify-center gap-2 sm:justify-start">
            <span className="text-5xl font-bold heading-gradient">{streakN}</span>
            <span className="text-sm text-gray-400">day streak 🔥</span>
          </div>
          {todayDetail ? (
            todayDetail.lessons > 0 ? (
              <div className="mt-3 flex justify-center gap-4 text-sm whitespace-nowrap sm:justify-start">
                <span>
                  <span className="font-bold text-cyan-300">{todayDetail.xp}</span>
                  <span className="ml-1 text-gray-500">XP</span>
                </span>
                <span>
                  <span className="font-bold text-violet-300">{todayDetail.minutes}</span>
                  <span className="ml-1 text-gray-500">min</span>
                </span>
                <span>
                  <span className="font-bold text-gray-200">{todayDetail.lessons}</span>
                  <span className="ml-1 text-gray-500">lessons</span>
                </span>
              </div>
            ) : (
              // 有 XP 但 lessons=0:daily 明细还没同步(xpGains 当天滞后),别显示误导性的 0 分钟
              <div className="mt-3 flex items-baseline gap-5 text-sm">
                <span>
                  <span className="font-bold text-cyan-300">{todayDetail.xp}</span>
                  <span className="ml-1 text-gray-500">XP</span>
                </span>
                <span className="text-gray-500">lesson detail updates tonight 🦉</span>
              </div>
            )
          ) : (
            <p className="mt-3 text-sm text-gray-500">No lessons yet today 🦉</p>
          )}
        </div>
        <ScoreBandChart />
        <ScoreBadge />
      </Card>

      {/* CEFR journey:五段完成度弧 */}
      {levels.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-medium text-gray-300">CEFR journey</h2>
          <CefrArc />
          <p className="mt-3 text-xs text-gray-500">
            Intro → A1 → A2 → B1 → B2. B2 is roughly comfortable working English.
          </p>
        </Card>
      )}

      {/* 统计卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat value={latest.totalXp.toLocaleString()} label="total XP" />
        <Stat
          value={`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`}
          label="time tracked"
        />
        <Stat value={`${weekMinutes} min`} label={`last 7 days (${weekXp} XP)`} />
        <Stat value={`${avgMinutes} min`} label="avg / active day" />
        <Stat value={String(current.sessionCount ?? '—')} label="lifetime lessons" />
        <Stat
          value={bestDay ? `${bestDay.xp}` : '—'}
          label={bestDay ? `best day (${bestDay.date.slice(5)})` : 'best day'}
        />
      </div>

      {/* 每日活动图 */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-baseline gap-2 text-sm font-medium text-gray-300">
            Daily activity
            <span className="text-xs font-normal text-gray-500">last 30 days</span>
          </h2>
          <span className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block size-2 rounded-full bg-cyan-400" /> XP
            <span className="ml-2 inline-block size-2 rounded-full bg-violet-400" /> minutes
          </span>
        </div>
        {days.length > 1 ? (
          <DailyChart />
        ) : (
          <p className="py-8 text-center text-sm text-gray-500">
            Chart appears after a few days 📈
          </p>
        )}
      </Card>

      {/* 打卡绿墙:日历周对齐,初始锚定最新一周 */}
      <Card>
        <h2 className="mb-3 text-sm font-medium text-gray-300">Activity</h2>
        <ActivityWall />
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          Less
          <span className="size-3 rounded-sm bg-gray-800" />
          <span className="size-3 rounded-sm bg-emerald-900" />
          <span className="size-3 rounded-sm bg-emerald-700" />
          <span className="size-3 rounded-sm bg-emerald-500" />
          <span className="size-3 rounded-sm bg-emerald-300" />
          More
        </div>
      </Card>

      <p className="text-sm text-gray-500">
        Data source: Duolingo API (updated daily via GitHub Actions). Longest streak{' '}
        {current.longestStreak ?? latest.streak} · study time as recorded by Duolingo. Score
        tracked since Aug 16 — earlier moves unrecorded, Aug 16–20 reconstructed from unit
        progress. Score step dates from lesson timestamps since Aug 29 and from snapshot times
        before. Started Jul 27 via placement test (Intro skipped, score placed in A1); ≈ is the
        estimate for the next score 🦉
      </p>
    </div>
  )
}
