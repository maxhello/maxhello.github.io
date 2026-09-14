// Notes(复习笔记)加载:content/notes/*.mdx,机制与 src/lib/posts.ts 相同
// 与博客的区别:笔记是活文档,frontmatter 用 updated(最后修订日)而不是 date(发布日),
// 不进 RSS;入口在 English 页面而不是顶部导航。
export interface NoteMeta {
  slug: string
  title: string
  updated: string
  /** 列表顺序(小的在前);同一系列的笔记按学习顺序排,不按修改日 */
  order?: number
  tags: string[]
  excerpt?: string
}

interface RawNoteModule {
  default: () => React.ReactElement
  frontmatter: {
    title: string
    updated: string
    order?: number
    tags?: string[]
    excerpt?: string
  }
}

export interface NoteModule {
  Content: () => React.ReactElement
  frontmatter: RawNoteModule['frontmatter']
}

const modules = import.meta.glob<RawNoteModule>('../../content/notes/*.mdx', {
  eager: true,
})

export const notes: NoteMeta[] = Object.entries(modules)
  .map(([path, mod]) => ({
    slug: path.split('/').pop()!.replace(/\.mdx$/, ''),
    title: mod.frontmatter.title,
    updated: mod.frontmatter.updated,
    order: mod.frontmatter.order,
    tags: mod.frontmatter.tags ?? [],
    excerpt: mod.frontmatter.excerpt,
  }))
  .sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      b.updated.localeCompare(a.updated),
  )

export function getNote(slug: string): NoteModule | undefined {
  const mod = modules[`../../content/notes/${slug}.mdx`]
  if (!mod) return undefined
  return { Content: mod.default, frontmatter: mod.frontmatter }
}
