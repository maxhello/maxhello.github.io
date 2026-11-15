import { useEffect, useState } from 'react'
import { site } from '../site.config'

/**
 * 学习路径页与 AI 口语陪练页(/english/tutor,代码在 src/tutor/)打通:
 * - 链接:`?unit=N` 练这一单元,`?history=unit:N` 看这一单元的练习记录
 * - 练习次数:直接复用陪练页存在 localStorage 的登录 JWT 调后端;
 *   没登录/接口失败一律当没有数据,不影响本页
 */

export const tutorPracticeUrl = (unitIndex: number) => `${site.tutor.url}?unit=${unitIndex}`
export const tutorHistoryUrl = (unitIndex: number) => `${site.tutor.url}?history=unit:${unitIndex}`

/** 陪练登录时写下的 key(见 src/tutor/Tutor.tsx、api.ts) */
function tutorJwt(): string | null {
  try {
    const user = localStorage.getItem('tutor-current')
    return user ? localStorage.getItem(`tutor-api-token:${user}`) : null
  } catch {
    return null
  }
}

/** 每个单元练过几次 {unitIndex: n};未登录陪练或拉取失败为 null */
export function useTutorStats(): Record<number, number> | null {
  const [stats, setStats] = useState<Record<number, number> | null>(null)
  useEffect(() => {
    const jwt = tutorJwt()
    if (!jwt) return
    let alive = true
    fetch(`${site.tutor.api}/api/units/stats`, { headers: { Authorization: `Bearer ${jwt}` } })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : null))
      .then((d) => {
        if (alive && d) setStats(Object.fromEntries(Object.entries(d).map(([k, v]) => [Number(k), v])))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return stats
}
