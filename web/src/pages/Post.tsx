import { Link, useParams } from 'react-router-dom'
import { getPost } from '../lib/posts'
import Comments from '../components/Comments'
import NotFound from './NotFound'
import { usePageTitle } from '../hooks/usePageTitle'

export default function Post() {
  const { slug } = useParams()
  const post = slug ? getPost(slug) : undefined

  usePageTitle(post?.frontmatter.title)

  if (!post) return <NotFound />

  const { Content, frontmatter } = post

  return (
    <article className="space-y-6">
      <header className="space-y-3 border-b border-gray-800 pb-6">
        <Link to="/blog" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back to blog
        </Link>
        <h1 className="text-3xl font-bold">{frontmatter.title}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <time>{frontmatter.date}</time>
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
      <Comments />
    </article>
  )
}
