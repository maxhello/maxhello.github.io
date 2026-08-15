import { Link } from 'react-router-dom'
import { posts } from '../lib/posts'

export default function Blog() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-gradient text-3xl font-bold">Blog</h1>
        <p className="mt-2 text-sm text-gray-400">
          Notes on backend, systems, and AI.
        </p>
      </div>
      {posts.length === 0 ? (
        <p className="text-gray-500">No posts yet.</p>
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                to={`/blog/${p.slug}`}
                className="block rounded-xl border border-gray-800/80 bg-gray-900/50 p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-[0_0_24px_-10px_rgba(34,211,238,0.4)]"
              >
                <h2 className="text-lg font-semibold text-gray-100">
                  {p.title}
                </h2>
                {p.excerpt && (
                  <p className="mt-1.5 text-sm text-gray-400">{p.excerpt}</p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <time className="font-mono">{p.date}</time>
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
