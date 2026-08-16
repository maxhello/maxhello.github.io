import { Link } from 'react-router-dom'
import history from '../../data/duolingo-history.json'
import { Card, SectionTitle } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

// since 取真实起点:建站 = 仓库首提交,条目本身 = git 历史里首次出现的日期
const sections = [
  {
    icon: '🔧',
    title: 'Building',
    titleClass: 'text-cyan-300',
    since: 'since Mar 2026',
    items: ['This personal site'],
  },
  {
    icon: '📚',
    title: 'Learning',
    titleClass: 'text-violet-300',
    since: 'since Aug 2026',
    items: ['AI / machine learning'],
  },
]

// 英语学习数据与 English 页同源(快照每日自动部署),数字跟着更新,不会写死过期
interface DayDetail {
  lessons: number
  minutes: number
  xp: number
}
interface Snapshot {
  totalXp: number
  streak: number
  streakStart: string
  daily?: Record<string, DayDetail>
}

const snaps = history as Snapshot[]
const latest = snaps[snaps.length - 1]
const last14 = Object.entries(latest.daily ?? {})
  .sort(([a], [b]) => a.localeCompare(b))
  .slice(-14)
const activeDays = last14.filter(([, v]) => v.xp > 0).length
const avgMinutes = Math.round(
  last14.reduce((s, [, v]) => s + v.minutes, 0) / Math.max(1, activeDays),
)

/** streakStart "2026-07-27" → "Jul 27, 2026"(与页面其余英文月份风格一致) */
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function Now() {
  usePageTitle('Now')
  return (
    <div className="space-y-8">
      <SectionTitle>Now</SectionTitle>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-cyan-300">🦉 Learning English</h2>
          <span className="font-mono text-xs text-gray-500">
            since {prettyDate(latest.streakStart)}
          </span>
        </div>
        <p className="leading-relaxed text-gray-300">
          Practicing Duolingo every day — a {latest.streak}-day streak so far and{' '}
          {latest.totalXp.toLocaleString()} XP in total. Over the past two weeks:{' '}
          {activeDays}/{last14.length} days active, ~{avgMinutes} min a day.
        </p>
        <p className="mt-2 leading-relaxed text-gray-300">
          🎯 Goal: hold everyday conversations entirely in English.
        </p>
        <Link
          to="/english"
          className="mt-3 inline-block text-sm text-cyan-400 hover:text-cyan-300"
        >
          Live dashboard →
        </Link>
      </Card>

      <div className="space-y-4">
        {sections.map((s) => (
          <Card key={s.title}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className={`font-semibold ${s.titleClass}`}>
                {s.icon} {s.title}
              </h2>
              <span className="font-mono text-xs text-gray-500">{s.since}</span>
            </div>
            <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-gray-300">
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="font-mono text-xs text-gray-500">Last updated: Aug 2026</p>
    </div>
  )
}
