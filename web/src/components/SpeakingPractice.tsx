import type { ReactNode } from 'react'
import { Card } from './ui'
import {
  fmtDuration,
  lastSpeakingDay,
  praktika,
  speakingDaily,
  speakingLevel,
  type PlanUnit,
} from '../lib/praktika'

const RECENT_SESSIONS = 5
const WORDS_SHOWN = 15
/** 超过这么多天没练,标题旁标 paused(试用结束/停用后卡片仍保留历史,不假装还在练) */
const PAUSED_AFTER_DAYS = 7

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const Label = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-500">{children}</span>
)

const UNIT_STYLE: Record<PlanUnit['state'], string> = {
  done: 'border-violet-400/60 bg-violet-400/15 text-violet-100',
  doing: 'border-violet-400 text-violet-200',
  todo: 'border-gray-800 text-gray-500',
}
const UNIT_NOTE: Record<PlanUnit['state'], string> = { done: ' · done', doing: ' · in progress', todo: '' }

function MicIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-violet-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  )
}

/** Speaking practice 卡:Praktika 最近上课记录 · 学习计划进度 · 课程里遇到的词。
 *  无数据时整卡不渲染;长时间没练标 paused,历史照常展示 */
export default function SpeakingPractice({ today }: { today: string }) {
  if (!lastSpeakingDay) return null
  const { current, sessions } = praktika
  const plan = current.plan ?? []
  const units = plan.flatMap((c) => c.units)
  const unitsDone = units.filter((u) => u.state === 'done').length
  const recent = sessions.slice(0, RECENT_SESSIONS)
  const lastDay = speakingDaily[lastSpeakingDay]
  const words = Object.entries(praktika.words ?? {})
  const shownWords = words.slice(-WORDS_SHOWN).reverse()
  const idleDays = Math.round((Date.parse(today) - Date.parse(lastSpeakingDay)) / 86_400_000)
  const since = praktika.meta.since

  return (
    <Card className="border-violet-400/35! px-6 pt-5 pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-gray-300">
          <MicIcon />
          Speaking practice
          <span className="text-xs font-normal text-gray-500">
            Praktika · AI tutor{since ? ` · since ${fmtDate(since)}` : ''}
            {idleDays > PAUSED_AFTER_DAYS && ` · paused, last practiced ${fmtDate(lastSpeakingDay)}`}
          </span>
        </h2>
        <span className="text-[11px] text-gray-500">
          {[speakingLevel && `Level ${speakingLevel}`, current.dailyGoal && `daily goal ${current.dailyGoal} min`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {/* 最近上课 */}
        <div className="min-w-0">
          <Label>Recent lessons</Label>
          <ul className="mt-2">
            {recent.map((s) => (
              <li key={s.id} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 border-b border-gray-800 py-2 text-sm">
                <span className="font-mono text-xs text-gray-500">
                  {s.date.slice(5)} {s.start}
                </span>
                <span className="truncate text-gray-200">{s.caption}</span>
                <span className="font-mono text-xs tabular-nums text-violet-300">{(s.seconds / 60).toFixed(1)} min</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            {fmtDate(lastSpeakingDay)} · {lastDay.lessons} {lastDay.lessons === 1 ? 'lesson' : 'lessons'} ·{' '}
            {fmtDuration(lastDay.minutes)}
            {lastDay.aborted ? ` · ${lastDay.aborted} restarts not counted` : ''}
          </p>
        </div>

        {/* 课程里遇到的词 */}
        {words.length > 0 && (
          <div className="min-w-0">
            <div className="flex items-baseline justify-between">
              <Label>Words &amp; phrases</Label>
              <span className="text-xs text-gray-500">
                <b className="text-gray-200">{words.length}</b> met
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {shownWords.map(([en, w]) => (
                <li key={en} className="inline-flex items-baseline gap-1.5 rounded-full border border-gray-800 bg-surface-2 px-2.5 py-1 text-[13px]">
                  <span className="text-gray-200">{en}</span>
                  <span className="text-xs text-gray-500">{w.zh}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              {words.length > WORDS_SHOWN ? `Latest ${WORDS_SHOWN} · ` : ''}from lesson material, glosses by Praktika
            </p>
          </div>
        )}
      </div>

      {/* 学习计划 */}
      {units.length > 0 && (
        <div className="mt-5 border-t border-gray-800 pt-4">
          <div className="flex items-baseline justify-between">
            <Label>Study plan</Label>
            <span className="text-xs text-gray-500">
              <b className="text-gray-200">{unitsDone}</b> / {units.length} units
            </span>
          </div>
          <div className="mt-2 space-y-3">
            {plan.map((cat, i) => (
              <div key={`${cat.name}-${i}`}>
                <div className="text-[13px] font-medium text-gray-300">{cat.name}</div>
                <ul className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
                  {cat.units.map((u, j) => (
                    <li key={`${u.name}-${j}`} className={`rounded-lg border px-2.5 py-1.5 text-xs ${UNIT_STYLE[u.state]}`}>
                      <div className="truncate">{u.name}</div>
                      <div className="text-[11px] opacity-80">
                        {u.lessons} lessons{UNIT_NOTE[u.state]}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
