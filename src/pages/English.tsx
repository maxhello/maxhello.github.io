import { useEffect, useRef, useState } from 'react'
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
}

interface Snapshot {
  username: string
  totalXp: number
  streak: number
  streakStart: string
  learningLanguage: string
  daily?: Record<string, DayDetail>
  longestStreak?: number
  sessionCount?: number
  sections?: Section[]
  date: string
}

const snaps = history as Snapshot[]
const latest = snaps[snaps.length - 1]
const first = snaps[0]

/** 访客本地日期(不能 toISOString:那是 UTC,北京时间早上 8 点前还是"昨天") */
function localIsoDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const todayIso = localIsoDate()

/** 每日明细:最新快照的 daily 全量 + XP 差值兜底 */
function dailyDetail(): Map<string, DayDetail> {
  const map = new Map<string, DayDetail>()
  for (const [d, v] of Object.entries(latest.daily ?? {})) map.set(d, v)
  snaps.forEach((s, i) => {
    if (!map.has(s.date) && i > 0) {
      map.set(s.date, {
        lessons: 0,
        minutes: 0,
        xp: Math.max(0, s.totalXp - snaps[i - 1].totalXp),
      })
    }
  })
  return map
}

const days = [...dailyDetail().entries()]
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

/** CEFR 段:合并同名段 */
function cefrSections(): { cefr: string; total: number; done: number }[] {
  const raw = (latest.sections ?? []).filter((s) => s.cefr)
  const merged = new Map<string, { cefr: string; total: number; done: number }>()
  for (const s of raw) {
    const cur = merged.get(s.cefr!) ?? { cefr: s.cefr!, total: 0, done: 0 }
    cur.total += s.unitsTotal
    cur.done += s.unitsCompleted
    merged.set(s.cefr!, cur)
  }
  return [...merged.values()]
}

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

/** 环形进度:SVG 描边动画 */
function ProgressRing({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 100)
    return () => clearTimeout(t)
  }, [])
  const R = 54
  const C = 2 * Math.PI * R
  return (
    <div className="relative flex size-36 items-center justify-center">
      <svg viewBox="0 0 128 128" className="size-36 -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="8" className="stroke-gray-800" />
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          stroke="url(#ringGrad)"
          strokeDasharray={C}
          strokeDashoffset={on ? C * (1 - pct / 100) : C}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold heading-gradient">{label}</div>
        <div className="mt-0.5 text-[10px] text-gray-500">{sub}</div>
      </div>
    </div>
  )
}

/** CEFR 关卡地图 */
function CefrMap() {
  const secs = cefrSections()
  if (secs.length === 0) return null
  // 当前所在:第一个未完成的段
  const currentIdx = secs.findIndex((s) => s.done < s.total)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {secs.map((s, i) => {
        const complete = s.done >= s.total
        const current = i === currentIdx
        const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
        return (
          <div key={s.cefr} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-700">→</span>}
            <div
              title={`${s.cefr}: ${s.done}/${s.total} units`}
              className={`relative overflow-hidden rounded-lg border px-3 py-2 text-center transition-all ${
                complete
                  ? 'border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_16px_-6px_rgba(34,211,238,0.6)]'
                  : current
                    ? 'border-violet-400/60 bg-violet-400/10 animate-pulse'
                    : 'border-gray-800 bg-gray-900/40 opacity-60'
              }`}
            >
              <div
                className={`font-mono text-sm font-bold ${
                  complete ? 'text-cyan-300' : current ? 'text-violet-300' : 'text-gray-500'
                }`}
              >
                {s.cefr}
              </div>
              <div className="text-[10px] text-gray-500">
                {complete ? 'done' : current ? `${pct}%` : 'locked'}
              </div>
              {current && s.total > 0 && (
                <div
                  className="absolute bottom-0 left-0 h-0.5 bg-violet-400 transition-all duration-1000"
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 渐变面积图:XP 面积 + 时长折线,悬停十字线 */
function DailyChart() {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const W = 660
  const H = 190
  const PAD = 10
  const maxXp = Math.max(50, ...days.map((d) => d.xp))
  const maxMin = Math.max(30, ...days.map((d) => d.minutes))
  const bw = W / days.length
  const px = (i: number) => i * bw + bw / 2
  // X 轴标签密度:每个标签约占 46px 宽,按天数抽稀
  const xLabelEvery = Math.max(1, Math.ceil(days.length / (W / 46)))
  const pyXp = (v: number) => H - PAD - (v / maxXp) * (H - PAD * 2)
  const pyMin = (v: number) => H - PAD - (v / maxMin) * (H - PAD * 2)

  const areaPath =
    `M ${px(0)},${pyXp(days[0].xp)} ` +
    days.map((d, i) => `L ${px(i)},${pyXp(d.xp)}`).join(' ') +
    ` L ${px(days.length - 1)},${H - PAD} L ${px(0)},${H - PAD} Z`
  const linePath = days.map((d, i) => `${px(i)},${pyMin(d.minutes)}`).join(' L ')
  const hoverD = hover !== null ? days[hover] : null

  /** 指针/手指横坐标 → 天索引,越界置空(鼠标与触屏共用) */
  const locate = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((clientX - rect.left) / rect.width) * W
    const i = Math.floor(x / bw)
    setHover(i >= 0 && i < days.length ? i : null)
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
        d={`M ${days.map((d, i) => `${px(i)},${pyXp(d.xp)}`).join(' L ')}`}
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
                  ~{hoverD.minutes}m · {hoverD.lessons}课
                </text>
              </g>
            )
          })()}
        </g>
      )}
      <line x1={0} y1={H - PAD} x2={W} y2={H - PAD} className="stroke-gray-700" strokeWidth="1" />
      {/* X 轴日期:隔 N 天标一个,每天画小刻度 */}
      {days.map((d, i) => (
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

  const secs = cefrSections()
  const totalUnits = secs.reduce((s, x) => s + x.total, 0)
  const doneUnits = secs.reduce((s, x) => s + x.done, 0)
  const coursePct = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>English Learning</SectionTitle>
        <SectionSubtitle>
          Daily Duolingo snapshots — auto-updated. Tracked since {days[0]?.date ?? first.date}.
        </SectionSubtitle>
      </div>

      {/* Hero:今日数据 + 课程进度环 */}
      <Card className="flex flex-col items-center gap-8 p-6 sm:flex-row sm:justify-around">
        <div className="text-center sm:text-left">
          <div className="font-mono text-xs text-gray-500">TODAY · {todayIso}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-bold heading-gradient">{streakN}</span>
            <span className="text-sm text-gray-400">day streak 🔥</span>
          </div>
          {todayDetail ? (
            <div className="mt-3 flex gap-5 text-sm">
              <span>
                <span className="font-bold text-cyan-300">{todayDetail.xp}</span>
                <span className="ml-1 text-gray-500">XP</span>
              </span>
              <span>
                <span className="font-bold text-violet-300">~{todayDetail.minutes}</span>
                <span className="ml-1 text-gray-500">min</span>
              </span>
              <span>
                <span className="font-bold text-gray-200">{todayDetail.lessons}</span>
                <span className="ml-1 text-gray-500">lessons</span>
              </span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No lessons yet today 🦉</p>
          )}
        </div>
        {totalUnits > 0 && (
          <ProgressRing pct={coursePct} label={`${coursePct}%`} sub={`course · ${doneUnits}/${totalUnits} units`} />
        )}
      </Card>

      {/* CEFR 地图 */}
      {secs.length > 0 && (
        <Card>
          <h2 className="mb-4 text-sm font-medium text-gray-300">CEFR journey</h2>
          <CefrMap />
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
        <Stat value={`~${avgMinutes} min`} label="avg / active day" />
        <Stat value={String(latest.sessionCount ?? '—')} label="lifetime lessons" />
        <Stat
          value={bestDay ? `${bestDay.xp}` : '—'}
          label={bestDay ? `best day (${bestDay.date.slice(5)})` : 'best day'}
        />
      </div>

      {/* 每日活动图 */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-300">Daily activity</h2>
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

      {/* 打卡绿墙 */}
      <Card>
        <h2 className="mb-3 text-sm font-medium text-gray-300">Activity</h2>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => (
            <div key={w} className="flex flex-col gap-1">
              {days.slice(w * 7, w * 7 + 7).map((d) => {
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
                    title={`${d.date}: ${d.xp} XP, ~${d.minutes} min`}
                    className={`size-3.5 rounded-sm transition-transform hover:scale-150 ${lvl} ${
                      d.date === todayIso ? 'animate-pulse ring-1 ring-cyan-300' : ''
                    }`}
                  />
                )
              })}
            </div>
          ))}
        </div>
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
        {latest.longestStreak ?? latest.streak} · duration estimated from lesson timestamps 🦉
      </p>
    </div>
  )
}
