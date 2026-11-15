/**
 * 学习数据(多邻国 / Praktika)的唯一入口。数据住在 site-api 的 PostgreSQL 里,由 k3s 定时采集,
 * 页面运行时从接口读;**没有打进包的快照**——接口不通时数据页显示"暂时取不到"(App.tsx)。
 *
 * 用到这些数据的页面(English / Now / Learn)都在**模块加载时**一次性算好派生值,
 * 所以它们在 App.tsx 里是懒加载的,并且等 `learningReady` 为 true 之后才加载模块——
 * 页面模块求值时 `learning.*` 一定已经有值。不要在这些页面之外静态 import 它们。
 */
import { site } from '../site.config'

/** 等接口的上限(Neon 休眠后首个请求要冷启动,留足余量) */
const TIMEOUT_MS = 10_000

/** Praktika 文档拉不到(或采集停用、库里没有)时的空壳:口语相关区块会自动隐藏,不拖累多邻国部分 */
const EMPTY_PRAKTIKA = { meta: {}, current: {}, daily: {}, sessions: [], words: {} }

export const learning: { duolingo: unknown; praktika: unknown } = {
  duolingo: null,
  praktika: EMPTY_PRAKTIKA,
}

async function fetchDoc(key: string): Promise<unknown> {
  try {
    const res = await fetch(`${site.api}/api/learning/${key}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const doc: unknown = await res.json()
    return doc && typeof doc === 'object' ? doc : null
  } catch {
    return null
  }
}

/**
 * 应用一启动就开始拉(main.tsx import 本模块),进数据页时多半已经到了。
 * 结果 = 多邻国文档是否拿到(数据页的硬依赖);永不 reject。
 */
export const learningReady: Promise<boolean> = Promise.all([
  fetchDoc('duolingo-history'),
  fetchDoc('praktika-history'),
]).then(([duolingo, praktika]) => {
  if (duolingo) learning.duolingo = duolingo
  if (praktika) learning.praktika = praktika
  return duolingo != null
})
