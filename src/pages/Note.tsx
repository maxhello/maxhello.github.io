import { Link, useParams } from 'react-router-dom'
import { getNote } from '../lib/notes'
import NotFound from './NotFound'
import { usePageTitle } from '../hooks/usePageTitle'

/** 单篇复习笔记:正文排版复用 .prose(与博客同一套,含表格样式);活文档不挂评论 */
export default function Note() {
  const { slug } = useParams()
  const note = slug ? getNote(slug) : undefined

  usePageTitle(note?.frontmatter.title)

  if (!note) return <NotFound />

  const { Content, frontmatter } = note

  return (
    <article className="space-y-6">
      <header className="space-y-3 border-b border-gray-800 pb-6">
        <Link to="/notes" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back to notes
        </Link>
        <h1 className="text-3xl font-bold">{frontmatter.title}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <time>updated {frontmatter.updated}</time>
          {frontmatter.tags?.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      </header>
      <div className="prose">
        <Content />
      </div>
    </article>
  )
}
