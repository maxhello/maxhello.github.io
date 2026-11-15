import { useEffect, useMemo, useState } from 'react'
import {
  type Account,
  type SessionDetail,
  type SessionSummary,
  deleteSession,
  getSession,
  listSessions,
} from './api'
import { Bubble, CorrectionItem } from './Tutor'

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (ts: number) => {
  const d = new Date(ts)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fmtDur = (s: number) => `${Math.floor(s / 60)}分${pad(s % 60)}秒`

/**
 * 练习历史抽屉(首页右侧滑出):全部来自后端(挂断时已自动保存),列表 + 点开回看气泡/纠错卡。
 * 可按多邻国单元筛选;initialUnit 来自 ?history=unit:N(站点学习路径页「查看练习记录」)。
 * 不写 localStorage —— 换浏览器/设备登录同账号看到的是同一份。
 */
export default function History({
  account,
  tick,
  open,
  onClose,
  initialUnit = null,
}: {
  account: Account | null
  tick: number
  open: boolean
  onClose: () => void
  initialUnit?: number | null
}) {
  /** 单元筛选:null = 全部 */
  const [unitFilter, setUnitFilter] = useState<number | null>(initialUnit)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(false)
  /** 已拉过的详情,按会话 id 缓存 */
  const [details, setDetails] = useState<Record<number, SessionDetail>>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const [err, setErr] = useState('')
  /** 正在确认删除的会话 id(按钮原地变成「确认/取消」) */
  const [confirming, setConfirming] = useState<number | null>(null)

  // 打开抽屉、切账号或有新会话保存成功(tick++)时重新拉列表
  useEffect(() => {
    if (!account || !open) return
    let alive = true
    setLoading(true)
    setErr('')
    listSessions(account)
      .then((list) => alive && setSessions(list))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [account, tick, open])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function toggle(id: number) {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    if (details[id] || !account) return
    try {
      const data = await getSession(account, id)
      setDetails((prev) => ({ ...prev, [id]: data }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(id: number) {
    setConfirming(null)
    if (!account) return
    try {
      await deleteSession(account, id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      setExpanded(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  /** 历史里出现过的单元(筛选下拉用),新→旧 */
  const unitOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const s of sessions) if (s.unitIndex != null) seen.set(s.unitIndex, s.unitLabel)
    if (unitFilter != null && !seen.has(unitFilter)) seen.set(unitFilter, `单元 ${unitFilter}`)
    return [...seen.entries()].sort((a, b) => b[0] - a[0])
  }, [sessions, unitFilter])
  const visible =
    unitFilter == null ? sessions : sessions.filter((s) => s.unitIndex === unitFilter)

  if (!account || !open) return null

  return (
    <>
      <div className="fixed inset-0 z-10 bg-[#030712]/55" onClick={onClose} />
      <aside
        aria-label="练习历史"
        className="slide-in fixed inset-y-0 right-0 z-20 flex w-[420px] max-w-full flex-col border-l border-gray-800 bg-[#0b1220] shadow-[-24px_0_48px_rgba(0,0,0,.4)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 pb-4 pt-5">
          <h2 className="text-lg font-semibold">练习历史</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex size-10 items-center justify-center rounded-xl border border-gray-800 text-slate-300 hover:bg-slate-800/60"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {unitOptions.length > 0 && (
          <div className="px-5 pt-3">
            <label htmlFor="history-unit" className="sr-only">
              按单元筛选
            </label>
            <select
              id="history-unit"
              value={unitFilter ?? ''}
              onChange={(e) => setUnitFilter(e.target.value === '' ? null : Number(e.target.value))}
              className="min-h-10 w-full rounded-xl border border-gray-800 bg-[#0f1a2e] px-3 text-sm text-slate-200 focus:border-cyan-400/60 focus:outline-none"
            >
              <option value="">全部练习</option>
              {unitOptions.map(([idx, label]) => (
                <option key={idx} value={idx}>
                  {label || `单元 ${idx}`}
                </option>
              ))}
            </select>
          </div>
        )}
        {err && <p className="px-5 pt-3 text-sm text-rose-400">{err}</p>}
        <div className="thin-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3.5">
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              {loading ? '加载中…' : unitFilter != null ? '这个单元还没练过' : '还没有练习记录'}
            </p>
          )}
          {visible.map((s) => {
            const detail = details[s.id]
            const isOpen = expanded === s.id
            return (
              <div key={s.id} className="flex flex-col gap-2">
                <button
                  onClick={() => toggle(s.id)}
                  aria-expanded={isOpen}
                  className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left ${
                    isOpen
                      ? 'border-cyan-400/40 bg-[#10203a]'
                      : 'border-[#1a2436] bg-[#0f1a2e] hover:border-gray-700'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="truncate text-[15px] font-medium">
                      {s.unitLabel || s.scenario || '自由聊天'}
                    </div>
                    <div className="text-[13px] text-gray-400">
                      {fmtDate(s.startedAt)}
                      {s.seconds > 0 && ` · ${fmtDur(s.seconds)}`}
                    </div>
                  </div>
                  {s.corrections > 0 && (
                    <span className="shrink-0 rounded-md bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">
                      {s.corrections} 错
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-3 rounded-2xl bg-[#08101e] p-3.5">
                    {!detail ? (
                      <p className="py-2 text-center text-sm text-gray-400">加载中…</p>
                    ) : (
                      <>
                        {detail.msgs.map((m, i) => (
                          <Bubble key={i} role={m.role} text={m.text} />
                        ))}
                        {detail.corrections.length > 0 && (
                          <div className="mt-1 flex flex-col gap-2 border-t border-gray-800 pt-3">
                            {detail.corrections.map((c, i) => (
                              <CorrectionItem key={i} c={c} />
                            ))}
                          </div>
                        )}
                        {confirming === s.id ? (
                          <div className="flex items-center justify-end gap-2 text-[13px]">
                            <span className="mr-auto text-gray-400">删除后无法恢复</span>
                            <button
                              onClick={() => setConfirming(null)}
                              className="rounded-lg px-2.5 py-1 text-slate-300 hover:bg-slate-800/60"
                            >
                              取消
                            </button>
                            <button
                              onClick={() => remove(s.id)}
                              className="rounded-lg bg-rose-500/90 px-2.5 py-1 font-medium text-white hover:bg-rose-500"
                            >
                              确认删除
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirming(s.id)}
                            className="self-end rounded-lg px-2.5 py-1 text-[13px] text-rose-400 hover:bg-rose-500/10"
                          >
                            删除这条记录
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
