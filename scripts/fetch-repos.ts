/**
 * 构建前脚本:拉取 GitHub 仓库列表,生成 src/data/repos.json
 * CI 中带 GITHUB_TOKEN(限额 5000/h),本地匿名(60/h,超限则沿用旧文件)
 * 用法: npx tsx scripts/fetch-repos.ts
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// 置顶仓库等配置与前端共用同一来源(src/site.config.ts 是唯一维护点)
import { site } from '../src/site.config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../src/data/repos.json')
// 用户名可用环境变量 GITHUB_USER 覆盖,默认与线上一致(见 src/site.config.ts)
const USER = process.env.GITHUB_USER || site.githubUser

interface Repo {
  id: number
  name: string
  description: string | null
  html_url: string
  homepage: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  topics: string[]
  fork: boolean
  pushed_at: string
}

const pinnedRepos = site.pinnedRepos

async function main() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const res = await fetch(
    `https://api.github.com/users/${USER}/repos?per_page=100&sort=updated`,
    { headers },
  )
  if (!res.ok) {
    if (existsSync(OUT)) {
      console.warn(`GitHub API ${res.status}, keeping existing repos.json`)
      return
    }
    if (process.env.CI) throw new Error(`GitHub API ${res.status}`)
    // 本地冷启动遇网络失败:写空列表让 dev 也能跑(Projects 显示空态),CI 则直接失败
    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, '[]\n')
    console.warn(`GitHub API ${res.status}, wrote empty repos.json — Projects page will be empty`)
    return
  }

  const repos: Repo[] = (await res.json()).filter((r: Repo) => !r.fork)
  repos.sort((a, b) => {
    const aP = pinnedRepos.includes(a.name)
    const bP = pinnedRepos.includes(b.name)
    if (aP !== bP) return aP ? -1 : 1
    if (b.stargazers_count !== a.stargazers_count)
      return b.stargazers_count - a.stargazers_count
    return b.pushed_at.localeCompare(a.pushed_at)
  })

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(repos, null, 2) + '\n')
  console.log(`Fetched ${repos.length} repos -> ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
