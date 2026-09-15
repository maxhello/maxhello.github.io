import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import history from '../../data/duolingo-history.json'
import { UnitGuideBody, unitLabel, useGuidebooks, type GuideUnit } from '../components/UnitGuide'
import { usePageTitle } from '../hooks/usePageTitle'

/**
 * 学习路径页(/english/learn):参考多邻国 learn 页的结构——顶部当前阶段横幅 + 蛇形单元节点路径,
 * 点节点在抽屉里打开该部分的官方指南(重点语句可听可点词、语法点)。
 * 进页面直接定位到正在学的节点:在数据到达后的那次渲染 useLayoutEffect 里瞬时(behavior instant)定位,
 * 首帧画出来就已经在位,不会看到页面往下滑(全站 html 有 scroll-behavior: smooth,必须显式 instant)。
 * 进度来自每日快照(score.lastUnitDone),指南内容来自 data/duolingo-guidebooks.json。
 * 只借鉴布局与交互,不用多邻国的商标、配色与素材。
 */
interface HistoryLite {
  days: { score?: { lastUnitDone?: number } }[]
}
const hist = history as unknown as HistoryLite
const lastUnitDone =
  [...hist.days].reverse().find((r) => r.score?.lastUnitDone != null)?.score?.lastUnitDone ?? -1
const currentUnit = lastUnitDone + 1

type Status = 'done' | 'current' | 'locked'
function statusOf(unitIndex: number): Status {
  if (unitIndex <= lastUnitDone) return 'done'
  if (unitIndex === currentUnit) return 'current'
  return 'locked'
}

/** 蛇形偏移(单位:节点半宽),8 个一循环,和多邻国路径的摆动幅度接近 */
const WAVE = [0, 1, 1.6, 1, 0, -1, -1.6, -1]

function Node({
  u,
  status,
  active,
  onOpen,
  refCb,
  pos,
}: {
  u: GuideUnit
  status: Status
  active: boolean
  onOpen: () => void
  refCb?: (el: HTMLDivElement | null) => void
  pos: number
}) {
  const offset = WAVE[pos % WAVE.length]
  const icon = status === 'done' ? '✓' : status === 'current' ? '★' : '🔒'
  return (
    <div
      ref={refCb}
      className="relative flex flex-col items-center py-3"
      style={{ transform: `translateX(${offset * 2.4}rem)` }}
    >
      {status === 'current' && (
        <span className="path-start mb-2 rounded-lg border border-cyan-400/60 bg-gray-950 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-cyan-300">
          Start
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`第 ${u.unitInSection} 部分 ${u.objective}`}
        className={`path-node path-node-${status} ${active ? 'path-node-active' : ''}`}
      >
        <span>{icon}</span>
      </button>
      <div className="mt-2 w-40 text-center">
        <div className={`text-xs ${status === 'locked' ? 'text-gray-600' : 'text-gray-300'}`}>
          {u.unitInSection}. {u.objective}
        </div>
        {u.grammar.length > 0 && (
          <div className="mt-0.5 text-[10px] font-medium tracking-wide text-violet-300/80">
            语法 · {u.grammar.map((g) => g.title).filter(Boolean).join(' / ') || '有'}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Learn() {
  usePageTitle('Learning path')
  const data = useGuidebooks()
  // ?unit=<unitIndex> 直接打开该部分的指南(English 页"当前指南"按钮用)
  const [params] = useSearchParams()
  const [openIdx, setOpenIdx] = useState<number | null>(() => {
    const q = Number(params.get('unit'))
    return Number.isFinite(q) && params.has('unit') ? q : null
  })
  const currentRef = useRef<HTMLDivElement | null>(null)
  const positioned = useRef(false)

  const bySection = useMemo(() => {
    const m = new Map<number, GuideUnit[]>()
    for (const u of data?.units ?? []) {
      if (!m.has(u.section)) m.set(u.section, [])
      m.get(u.section)!.push(u)
    }
    return m
  }, [data])

  const current = data?.units.find((u) => u.unitIndex === currentUnit)
  const openUnit = openIdx != null ? data?.units.find((u) => u.unitIndex === openIdx) : undefined

  // 数据到达后的首次渲染,绘制前瞬时定位到当前节点(不带动画)
  useLayoutEffect(() => {
    if (data && currentRef.current && !positioned.current) {
      positioned.current = true
      currentRef.current.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
  }, [data])

  // 抽屉打开时:Esc 关闭 + 锁住页面滚动(抽屉自己滚)
  useEffect(() => {
    if (openIdx == null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenIdx(null)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [openIdx])

  if (!data) return <p className="text-gray-500">Loading path…</p>

  return (
    <div className="space-y-6">
      <Link to="/english" className="text-sm text-gray-500 hover:text-gray-300">
        ← Back to English
      </Link>

      {/* 当前阶段横幅 */}
      {current && (
        <div className="path-banner">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-cyan-100/80">
              {unitLabel(current)} · {current.cefr}
            </div>
            <div className="mt-1 truncate text-xl font-bold text-white">{current.objective}</div>
          </div>
          <button type="button" onClick={() => setOpenIdx(current.unitIndex)} className="btn-chunky">
            指南
          </button>
        </div>
      )}

      {/* 路径 */}
      <div className="overflow-hidden">
        {data.sections.map((sec) => {
          const units = bySection.get(sec.index)
          const done = units ? units.filter((u) => statusOf(u.unitIndex) === 'done').length : 0
          return (
            <section key={sec.index} className="py-4">
              <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-gray-500">
                <span className="h-px flex-1 bg-gray-800" />
                <span>
                  第 {sec.index + 1} 阶段 · {sec.cefr ?? '—'} · {units ? `${done}/${sec.units}` : `${sec.units} 部分`}
                  {!units && ' 🔒'}
                </span>
                <span className="h-px flex-1 bg-gray-800" />
              </div>
              {units ? (
                <div className="flex flex-col items-center">
                  {units.map((u, i) => {
                    const st = statusOf(u.unitIndex)
                    return (
                      <Node
                        key={u.unitIndex}
                        u={u}
                        pos={i}
                        status={st}
                        active={openIdx === u.unitIndex}
                        onOpen={() => setOpenIdx(u.unitIndex)}
                        refCb={st === 'current' ? (el) => (currentRef.current = el) : undefined}
                      />
                    )
                  })}
                </div>
              ) : (
                <p className="text-center text-xs text-gray-600">
                  指南尚未缓存,到这一阶段前跑一次 <code>npm run guidebooks</code>
                </p>
              )}
            </section>
          )
        })}
      </div>

      {/* 指南抽屉:portal 到 body。<main> 的 fade-up 动画结束后留着 transform,
          会把 fixed 元素钉在 main 顶部而不是视口——页面滚到底再打开就得往上翻很久 */}
      {openUnit &&
        createPortal(
          <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpenIdx(null)} />
          <aside className="path-drawer" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-4 border-b border-gray-800 pb-3">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  {unitLabel(openUnit)} · {openUnit.cefr}
                </div>
                <h2 className="mt-1 text-xl font-bold text-gray-100">{openUnit.objective}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpenIdx(null)}
                aria-label="close"
                className="rounded-lg px-2 py-1 text-xl text-gray-500 hover:bg-gray-800 hover:text-gray-200"
              >
                ×
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto pb-6">
              <UnitGuideBody unit={openUnit} ttsBase={data.ttsBase} />
            </div>
          </aside>
          </>,
          document.body,
        )}
    </div>
  )
}
