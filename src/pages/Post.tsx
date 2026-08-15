import { Link, useParams } from 'react-router-dom'
import { getPost } from '../lib/posts'
import Comments from '../components/Comments'
import NotFound from './NotFound'

// Long-form typography for MDX content (hand-rolled, Tailwind has no prose)
const prose =
  'space-y-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm dark:[&_code]:bg-gray-800 [&_pre]:rounded-lg [&_pre]:bg-gray-950 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:text-gray-600 dark:[&_blockquote]:text-gray-400 [&_ul]:list-disc [&_ul]:pl-5'

export default function Post() {
  const { slug } = useParams()
  const post = slug ? getPost(slug) : undefined

  if (!post) return <NotFound />

  const { Content, frontmatter } = post

  return (
    <article className="space-y-6">
      <header className="space-y-3 border-b border-gray-200 pb-6 dark:border-gray-800">
        <Link
          to="/blog"
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          ← Back to blog
        </Link>
        <h1 className="text-3xl font-bold">{frontmatter.title}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <time>{frontmatter.date}</time>
          {frontmatter.tags?.map((t) => (
            <span
              key={t}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800"
            >
              {t}
            </span>
          ))}
        </div>
      </header>
      <div className={prose}>
        <Content />
      </div>
      <Comments />
    </article>
  )
}
