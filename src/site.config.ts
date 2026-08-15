/**
 * 站点全局配置:用户名 / 仓库名等只在此处维护,
 * 代码里一律从这里 import,改名时只改这一个文件。
 */
export const site = {
  /** GitHub 用户名 */
  githubUser: 'maxhello',
  /** 用户站点仓库名(必须是 `${githubUser}.github.io`) */
  siteRepo: 'maxhello.github.io',
  /** 固定展示的仓库名(Projects 页置顶) */
  pinnedRepos: ['maxhello.github.io'],
  /** giscus 评论配置(giscus.app 生成,repo 改名后 ID 不变) */
  giscus: {
    repoId: 'R_kgDORrItCQ',
    categoryId: 'DIC_kwDORrItCc4DDaPd',
    category: 'Announcements',
  },
} as const

export const githubProfileUrl = `https://github.com/${site.githubUser}`
