/**
 * Praktika(AI 口语 App)数据:data/praktika-history.json,由 scripts/fetch-praktika.py 每日采集。
 * English 页的 Pulse / Speaking practice / Activity 与 Now 页共用这一份派生数据。
 */
import raw from '../../data/praktika-history.json'

export interface SpeakingDay {
  lessons: number
  minutes: number
  /** 中途退出次数(不计入课数/时长) */
  aborted?: number
}

export interface SpeakingSession {
  id: string
  /** 北京时间,按开始时间归日 */
  date: string
  start: string
  seconds: number
  caption: string
  lessonId?: string
}

export interface PlanUnit {
  name: string
  lessons: number
  state: 'done' | 'doing' | 'todo'
}

interface PraktikaHistory {
  meta: { since?: string | null }
  current: {
    streak?: number
    streakEnd?: string
    longestStreak?: number
    level?: string
    dailyGoal?: number
    plan?: { name: string; units: PlanUnit[] }[]
  }
  daily: Record<string, SpeakingDay>
  /** 近 30 天的完成课,开始时间倒序 */
  sessions: SpeakingSession[]
  /** 课程材料里出现过的词/短语 → 释义与首见日 */
  words: Record<string, { zh: string; date: string }>
}

export const praktika = raw as PraktikaHistory
export const speakingDaily: Record<string, SpeakingDay> = praktika.daily ?? {}
export const speakingDays = Object.entries(speakingDaily)
  .filter(([, v]) => v.lessons > 0)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, v]) => ({ date, ...v }))
export const hasSpeaking = speakingDays.length > 0
export const speakingMinutes = speakingDays.reduce((s, d) => s + d.minutes, 0)
export const speakingLessons = speakingDays.reduce((s, d) => s + d.lessons, 0)
export const lastSpeakingDay = speakingDays[speakingDays.length - 1]?.date

/** 某天的口语分钟数(没练为 0),给 Duolingo 为主的图表叠加用 */
export const speakingMinutesOn = (date: string) => speakingDaily[date]?.minutes ?? 0

/** "A0_1" → "A0":接口的细分档只在 Praktika 内部有意义,页面只展示 CEFR 大档 */
export const speakingLevel = praktika.current.level?.split('_')[0]

export const fmtDuration = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
