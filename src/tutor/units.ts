/**
 * 陪练页用的多邻国单元数据,与站点学习路径页同源:
 * - 进度:lib/learning.ts 的多邻国文档,当前单元 = 最新一份带 score.lastUnitDone 的快照 + 1
 * - 指南:components/UnitGuide.tsx 的 loadGuidebooks()(每个单元的目标、关键句、语法点)
 */
import { loadGuidebooks, type GuideUnit } from '../components/UnitGuide'
import { learning, learningReady } from '../lib/learning'

export type { GuideBlock, GuideSentence, GuideUnit, GuideWord } from '../components/UnitGuide'

type HistoryLite = { days: { score?: { lastUnitDone?: number } }[] }

/** 传给后端 /api/token 的单元练习材料(后端限长,原样转给 Emma) */
export type UnitBrief = {
  index: number
  label: string
  objective: string
  sentences: { en: string; zh: string }[]
  grammar: { title: string; examples: string[] }[]
}

export type UnitData = {
  /** 正在学的单元(unitIndex,0-based 全局编号) */
  current: number
  /** 读音 mp3 的公共前缀(文件里多数只存哈希) */
  ttsBase: string
  /** 可以练的单元:已完成 + 当前,且有指南缓存;新→旧 */
  units: GuideUnit[]
}

/** App 里的叫法:第 N 阶段 · 第 M 部分 */
export function unitLabel(u: GuideUnit): string {
  return `第 ${u.section + 1} 阶段 · 第 ${u.unitInSection} 部分`
}

/** 指南文本里的 **粗体** 标记去掉 */
const plain = (s: string) => s.replace(/\*\*/g, '').trim()

/** 一个单元精简成练习材料:关键句最多 10 条,语法点最多 3 个、各 3 个例句 */
export function unitBrief(u: GuideUnit): UnitBrief {
  return {
    index: u.unitIndex,
    label: `${unitLabel(u)} · ${plain(u.objective)}`.slice(0, 60), // 历史记录里显示
    objective: plain(u.objective).slice(0, 200),
    sentences: u.keySentences.slice(0, 10).map((s) => ({
      en: plain(s.en).slice(0, 200),
      zh: plain(s.zh ?? '').slice(0, 200),
    })),
    grammar: u.grammar.slice(0, 3).map((g) => ({
      title: plain(g.title).slice(0, 200),
      examples: g.blocks
        .flatMap((b) => (b.type === 'example' && b.en ? [plain(b.en).slice(0, 200)] : []))
        .slice(0, 3),
    })),
  }
}

let cache: Promise<UnitData> | null = null

/** 读进度 + 指南(同一页面只读一次);失败时 reject,调用方隐藏单元卡片 */
export function loadUnits(): Promise<UnitData> {
  cache ??= Promise.all([
    learningReady.then((ok) => {
      if (!ok) throw new Error('learning data unavailable')
      return learning.duolingo as HistoryLite
    }),
    loadGuidebooks(),
  ])
    .then(([history, guide]) => {
      const lastUnitDone =
        [...history.days].reverse().find((d) => d.score?.lastUnitDone != null)?.score
          ?.lastUnitDone ?? -1
      const current = lastUnitDone + 1
      const units = guide.units
        .filter((u) => u.unitIndex <= current && u.keySentences.length > 0)
        .sort((a, b) => b.unitIndex - a.unitIndex)
      return { current, ttsBase: guide.ttsBase, units }
    })
    .catch((e) => {
      cache = null // 下次打开再试
      throw e
    })
  return cache
}

/** 读音地址:多数是哈希(拼公共前缀),少数本身就是完整 URL */
export const ttsUrl = (base: string, tts: string | undefined) =>
  !tts ? '' : /^https?:\/\//.test(tts) ? tts : base + tts
