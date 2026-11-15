import { posts } from '../lib/posts'
import { CardRouterLink, SectionSubtitle, SectionTitle, Tag } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

export default function Blog() {
  usePageTitle('Blog')
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>Blog</SectionTitle>
        <SectionSubtitle>Notes on backend, systems, and AI.</SectionSubtitle>
      </div>
      {posts.length === 0 ? (
        <p className="text-gray-500">No posts yet.</p>
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.slug}>
              <CardRouterLink to={`/blog/${p.slug}`}>
                <h2 className="text-lg font-semibold text-gray-100">
                  {p.title}
                </h2>
                {p.excerpt && (
                  <p className="mt-1.5 text-sm text-gray-400">{p.excerpt}</p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <time className="font-mono">{p.date}</time>
                  {p.tags.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              </CardRouterLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
