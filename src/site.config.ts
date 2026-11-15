/**
 * 站点全局配置:用户名 / 仓库名等只在此处维护,
 * 代码里一律从这里 import,改名时只改这一个文件。
 */
export const site = {
  /** 站点正式地址(无尾斜杠):canonical / sitemap / RSS / robots 共用 */
  siteUrl: 'https://maxhello.github.io',
  /** SEO / RSS / 页面标题用 */
  siteName: 'Max Zhang',
  tagline: 'Backend & AI',
  siteDescription:
    'Backend / systems engineer exploring AI — projects, notes, and an English-learning dashboard.',
  /** GitHub 用户名 */
  githubUser: 'maxhello',
  /** 用户站点仓库名(必须是 `${githubUser}.github.io`) */
  siteRepo: 'maxhello.github.io',
  /** 固定展示的仓库名(Projects 页置顶) */
  pinnedRepos: ['lp-lab', 'maxhello.github.io'],
  /** 后端 site-api(k3s;域名沿用早先的 tutor.*):学习数据只读接口 + 口语陪练的登录/房间/历史 */
  api: 'https://tutor.161-118-222-205.sslip.io',
  /** AI 口语陪练页:本站路由(不套 Layout 的全屏通话页) */
  tutor: {
    url: '/english/tutor',
  },
  /** giscus 评论配置(giscus.app 生成,repo 改名后 ID 不变) */
  giscus: {
    repoId: 'R_kgDORrItCQ',
    categoryId: 'DIC_kwDORrItCc4DDaPd',
    category: 'Announcements',
  },
} as const

export const githubProfileUrl = `https://github.com/${site.githubUser}`
