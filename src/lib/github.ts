import { site } from '../site.config'

export interface Repo {
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

// 语言 -> 颜色(取自 github-linguist 常用子集)
export const languageColors: Record<string, string> = {
  Go: '#00ADD8',
  Python: '#3572A5',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  C: '#555555',
  'C++': '#f34b7d',
  Rust: '#dea584',
  Java: '#b07219',
  Vue: '#41b883',
  MDX: '#fcb32c',
}

// 固定项目:优先展示,不受 API 影响(配置见 site.config.ts)
export const pinnedRepos = site.pinnedRepos

// 构建时由 scripts/fetch-repos.ts 生成的静态数据
// (dev / build 前都会自动跑该脚本,文件 gitignored,见 package.json 的 data 脚本)
import reposJson from '../data/repos.json'

export const repos: Repo[] = reposJson
