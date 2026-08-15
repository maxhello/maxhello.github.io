/**
 * 构建前脚本:拉取 GitHub 仓库列表,生成 src/data/repos.json
 * CI 中带 GITHUB_TOKEN(限额 5000/h),本地匿名(60/h,超限则沿用旧文件)
 * 用法: npx tsx scripts/fetch-repos.ts
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../src/data/repos.json')
// 用户名可用环境变量 GITHUB_USER 覆盖,默认与线上一致(见 src/site.config.ts)
const USER = process.env.GITHUB_USER || 'maxzhangdev'

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

const pinnedRepos = ['maxzhangdev.github.io']

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
    throw new Error(`GitHub API ${res.status}`)
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
