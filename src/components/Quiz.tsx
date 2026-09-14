import { useRef, useState, type KeyboardEvent } from 'react'

/**
 * 笔记里的自测题:看中文,自己敲英文,回车看答案并自动判对错。
 * 用法(MDX):<Quiz items={[{ q: '她很高吗?', a: 'Is she tall?', why: '有 be,提前' }]} />
 * a 可以是字符串数组,任一匹配即算对(缩写/全写两种都收)。判分忽略大小写、标点和多余空格。
 * 纯前端临时状态,刷新即清空,不存任何东西。
 */
export interface QuizItem {
  q: string
  a: string | string[]
  why?: string
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCorrect(input: string, answers: string | string[]): boolean {
  const mine = normalize(input)
  if (!mine) return false
  const list = Array.isArray(answers) ? answers : [answers]
  return list.some((a) => normalize(a) === mine)
}

export default function Quiz({ items }: { items: QuizItem[] }) {
  const [inputs, setInputs] = useState<string[]>(() => items.map(() => ''))
  const [revealed, setRevealed] = useState<boolean[]>(() => items.map(() => false))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const reveal = (i: number) => {
    setRevealed((r) => r.map((v, k) => (k === i ? true : v)))
  }
  const focusNext = (i: number) => {
    const next = refs.current[i + 1]
    if (next) next.focus()
  }
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (revealed[i]) focusNext(i)
    else reveal(i)
  }
  const reset = () => {
    setInputs(items.map(() => ''))
    setRevealed(items.map(() => false))
    refs.current[0]?.focus()
  }

  const done = revealed.filter(Boolean).length
  const right = items.filter((it, i) => revealed[i] && isCorrect(inputs[i], it.a)).length
  const primary = (a: string | string[]) => (Array.isArray(a) ? a[0] : a)

  return (
    <div className="not-prose space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          已答 {done} / {items.length}
          {done > 0 && (
            <>
              {' · '}对 <span className="text-cyan-300">{right}</span>
            </>
          )}
        </span>
        <button type="button" onClick={reset} className="hover:text-gray-300">
          重做
        </button>
      </div>
      <ol className="space-y-3">
        {items.map((it, i) => {
          const shown = revealed[i]
          const ok = shown && isCorrect(inputs[i], it.a)
          return (
            <li
              key={i}
              className={`rounded-lg border p-3 ${
                shown
                  ? ok
                    ? 'border-cyan-500/40 bg-cyan-950/20'
                    : 'border-violet-500/40 bg-violet-950/20'
                  : 'border-gray-800 bg-gray-900/40'
              }`}
            >
              <div className="mb-2 flex items-baseline gap-2 text-gray-100">
                <span className="font-mono text-xs text-gray-500">{i + 1}.</span>
                <span>{it.q}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={(el) => {
                    refs.current[i] = el
                  }}
                  type="text"
                  value={inputs[i]}
                  onChange={(e) =>
                    setInputs((v) => v.map((x, k) => (k === i ? e.target.value : x)))
                  }
                  onKeyDown={(e) => onKey(i, e)}
                  placeholder="写英文,回车看答案"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => (shown ? focusNext(i) : reveal(i))}
                  className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-400 hover:text-cyan-300"
                >
                  {shown ? '下一题' : '看答案'}
                </button>
              </div>
              {shown && (
                <div className="mt-2 space-y-1 text-sm">
                  <div>
                    <span className={ok ? 'text-cyan-300' : 'text-violet-300'}>
                      {ok ? '✓ 对了' : '✗ 再看一遍'}
                    </span>
                    <span className="ml-2 font-medium text-gray-100">{primary(it.a)}</span>
                  </div>
                  {!ok && inputs[i].trim() && (
                    <div className="text-gray-500">
                      你写的:<span className="text-gray-400 line-through">{inputs[i]}</span>
                    </div>
                  )}
                  {it.why && <div className="text-gray-400">{it.why}</div>}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
