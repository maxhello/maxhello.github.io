// 博客文章加载:content/posts/*.mdx 通过 Vite 的 import.meta.glob 静态收集
// MDX 编译后:正文组件是 default export,元数据是具名 export frontmatter
export interface PostMeta {
  slug: string
  title: string
  date: string
  tags: string[]
  excerpt?: string
}

interface RawPostModule {
  default: () => React.ReactElement
  frontmatter: {
    title: string
    date: string
    tags?: string[]
    excerpt?: string
  }
}

export interface PostModule {
  Content: () => React.ReactElement
  frontmatter: RawPostModule['frontmatter']
}

const modules = import.meta.glob<RawPostModule>('../../content/posts/*.mdx', {
  eager: true,
})

export const posts: PostMeta[] = Object.entries(modules)
  .map(([path, mod]) => ({
    slug: path.split('/').pop()!.replace(/\.mdx$/, ''),
    title: mod.frontmatter.title,
    date: mod.frontmatter.date,
    tags: mod.frontmatter.tags ?? [],
    excerpt: mod.frontmatter.excerpt,
  }))
  .sort((a, b) => b.date.localeCompare(a.date))

export function getPost(slug: string): PostModule | undefined {
  const mod = modules[`../../content/posts/${slug}.mdx`]
  if (!mod) return undefined
  return { Content: mod.default, frontmatter: mod.frontmatter }
}
