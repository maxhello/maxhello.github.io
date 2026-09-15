import { Fragment, useEffect, useState, type ReactNode } from 'react'

/**
 * 多邻国单元指南(App 里每部分的"指南":重点语句 + 语法点,官方原文)的数据与渲染。
 * 数据:data/duolingo-guidebooks.json,由 scripts/fetch-guidebooks.py 手动生成;
 * 走动态 import 单独成 chunk,只在学习路径页加载。
 * 交互对齐多邻国:句子可点喇叭听整句读音;点单词弹出释义并读该词;英文下面有中文。
 */
export interface GuideWord {
  w: string
  hints: string[]
  tts: string
}
export interface GuideSentence {
  en: string
  zh: string
  tts: string
  words: GuideWord[]
}
export interface GuideBlock {
  type: 'text' | 'example' | 'table'
  text?: string
  en?: string
  zh?: string
  tts?: string
  rows?: string[][]
}
export interface GuideGrammar {
  title: string
  blocks: GuideBlock[]
}
export interface GuideUnit {
  unitIndex: number
  section: number
  unitInSection: number
  cefr: string | null
  objective: string
  keySentences: GuideSentence[]
  grammar: GuideGrammar[]
}
export interface GuideFile {
  fetchedAt: string
  ttsBase: string
  sections: { index: number; cefr: string | null; units: number }[]
  units: GuideUnit[]
}

let cache: Promise<GuideFile> | null = null
export function loadGuidebooks(): Promise<GuideFile> {
  cache ??= import('../../data/duolingo-guidebooks.json').then((m) => m.default as GuideFile)
  return cache
}

/** 指南数据 hook:未加载时返回 null */
export function useGuidebooks(): GuideFile | null {
  const [data, setData] = useState<GuideFile | null>(null)
  useEffect(() => {
    let alive = true
    loadGuidebooks().then((d) => {
      if (alive) setData(d)
    })
    return () => {
      alive = false
    }
  }, [])
  return data
}

/** App 里的叫法:第 N 阶段 · 第 M 部分 */
export function unitLabel(u: GuideUnit): string {
  return `第 ${u.section + 1} 阶段 · 第 ${u.unitInSection} 部分`
}

/* ── 读音:同一时刻只放一段 ─────────────────────────── */
let playing: HTMLAudioElement | null = null
function play(url: string) {
  if (!url) return
  playing?.pause()
  playing = new Audio(url)
  void playing.play().catch(() => {})
}

/** 喇叭图标:实心机身 + 两道声波,线条统一 2.2 粗 */
function SpeakerIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M4 9.5v5a1 1 0 0 0 1 1h2.6l4.2 3.4a.8.8 0 0 0 1.3-.6V5.7a.8.8 0 0 0-1.3-.6L7.6 8.5H5a1 1 0 0 0-1 1Z"
        fill="currentColor"
      />
      <path d="M16 9a4.2 4.2 0 0 1 0 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18.8 6.3a8 8 0 0 1 0 11.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/** 读音按钮:圆角实心块 + 厚底,按下会"沉"一下(多邻国的喇叭按钮质感) */
function SpeakerButton({ url, small = false }: { url: string; small?: boolean }) {
  const [active, setActive] = useState(false)
  if (!url) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        play(url)
        setActive(true)
        window.setTimeout(() => setActive(false), 600)
      }}
      aria-label="play"
      className={`speaker-btn ${small ? 'speaker-btn-sm' : ''} ${active ? 'speaker-btn-active' : ''}`}
    >
      <SpeakerIcon className={small ? 'size-4' : 'size-5'} />
    </button>
  )
}

/** `**x**` → <strong>,官方讲解里加粗的就是重点 */
export function rich(s: string): ReactNode {
  const parts = s.split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-cyan-200">
        {p}
      </strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  )
}

/* ── 可点词的句子:点词弹释义 + 读该词(多邻国的点词提示) ── */
function TappableSentence({
  s,
  ttsBase,
  id,
  open,
  setOpen,
}: {
  s: GuideSentence
  ttsBase: string
  id: string
  open: string | null
  setOpen: (k: string | null) => void
}) {
  const text = s.en.replace(/\*\*/g, '')
  const tokens = text.match(/[A-Za-z'’-]+|[^A-Za-z'’-]+/g) ?? [text]
  let wi = 0
  return (
    <span className="leading-loose">
      {tokens.map((tok, ti) => {
        const word = s.words[wi]
        if (word && tok === word.w) {
          wi += 1
          const key = `${id}-${ti}`
          const isOpen = open === key
          return (
            <span key={ti} className="relative inline-block" data-hint>
              <button
                type="button"
                onClick={() => {
                  setOpen(isOpen ? null : key)
                  if (!isOpen) play(ttsBase + word.tts)
                }}
                className={`border-b-2 border-dotted transition ${
                  isOpen ? 'border-cyan-300 text-cyan-200' : 'border-gray-600 hover:border-cyan-400'
                }`}
              >
                {tok}
              </button>
              {isOpen && (
                <span className="absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 shadow-lg">
                  {word.hints.join(' / ')}
                </span>
              )}
            </span>
          )
        }
        return <Fragment key={ti}>{tok}</Fragment>
      })}
    </span>
  )
}

/** 一句重点语句:喇叭 + 可点词英文 + 中文 */
function KeySentence(props: {
  s: GuideSentence
  ttsBase: string
  id: string
  open: string | null
  setOpen: (k: string | null) => void
}) {
  const { s, ttsBase } = props
  return (
    <li className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
      <SpeakerButton url={ttsBase + s.tts} />
      <div className="min-w-0">
        <div className="text-base text-gray-100">
          <TappableSentence {...props} />
        </div>
        {s.zh && <div className="mt-0.5 text-sm text-gray-500">{s.zh}</div>}
      </div>
    </li>
  )
}

function ExampleBlock({ b, ttsBase }: { b: GuideBlock; ttsBase: string }) {
  return (
    <div className="flex items-start gap-2 border-l-2 border-cyan-500/40 pl-3">
      <SpeakerButton url={b.tts ? ttsBase + b.tts : ''} small />
      <div>
        <div className="text-gray-100">{rich(b.en ?? '')}</div>
        {b.zh && <div className="text-xs text-gray-500">{b.zh}</div>}
      </div>
    </div>
  )
}

function TableBlock({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr>
            {rows[0].map((c, ci) => (
              <th key={ci} className="pb-1 pr-4 text-left font-medium text-cyan-200/80">
                {rich(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((r, ri) => (
            <tr key={ri} className="border-t border-gray-800">
              {r.map((c, ci) => (
                <td key={ci} className="py-1 pr-4 align-top text-gray-200">
                  {rich(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 指南正文:重点语句 + 语法点。外层(抽屉/卡片)自己放标题 */
export function UnitGuideBody({ unit, ttsBase }: { unit: GuideUnit; ttsBase: string }) {
  const [open, setOpen] = useState<string | null>(null)
  // 点空白处收起释义
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-hint]')) setOpen(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open])

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">重点语句</h4>
        <ul className="space-y-2">
          {unit.keySentences.map((s, i) => (
            <KeySentence
              key={i}
              s={s}
              ttsBase={ttsBase}
              id={`${unit.unitIndex}-${i}`}
              open={open}
              setOpen={setOpen}
            />
          ))}
        </ul>
      </section>

      {unit.grammar.map((g, gi) => (
        <section key={gi} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">语法点</h4>
          {g.title && <h3 className="mb-3 text-lg font-bold text-gray-100">{g.title}</h3>}
          <div className="space-y-3 text-sm">
            {g.blocks.map((b, bi) => {
              if (b.type === 'text') return <p key={bi} className="text-gray-300">{rich(b.text ?? '')}</p>
              if (b.type === 'example') return <ExampleBlock key={bi} b={b} ttsBase={ttsBase} />
              if (b.type === 'table' && b.rows?.length) return <TableBlock key={bi} rows={b.rows} />
              return null
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
