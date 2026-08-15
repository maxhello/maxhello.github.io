import { Link } from 'react-router-dom'
import { posts } from '../lib/posts'

const stacks = ['Backend', 'Systems', 'AI / ML', 'Go', 'Python']

export default function Home() {
  const latest = posts.slice(0, 3)

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="pt-10 text-center">
        <p className="mb-4 font-mono text-sm text-cyan-400">
          $ whoami
        </p>
        <h1 className="text-gradient text-5xl font-bold tracking-tight">
          Max
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-gray-400">
          Backend & systems engineer, diving into{' '}
          <span className="text-cyan-300">AI</span> and{' '}
          <span className="text-violet-300">machine learning</span>.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {stacks.map((s) => (
            <span
              key={s}
              className="rounded-full border border-gray-700/80 bg-gray-900/50 px-3 py-1 text-sm text-gray-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-300"
            >
              {s}
            </span>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-4">
          <a
            href="https://github.com/zhanghongzheng6"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 font-medium text-white shadow-[0_0_24px_-6px_rgba(34,211,238,0.6)] transition-all hover:shadow-[0_0_32px_-4px_rgba(34,211,238,0.8)]"
          >
            GitHub →
          </a>
          <Link
            to="/blog"
            className="rounded-lg border border-gray-700 bg-gray-900/50 px-5 py-2.5 font-medium text-gray-200 transition-colors hover:border-violet-400/60 hover:text-violet-300"
          >
            Read the blog
          </Link>
        </div>
      </section>

      {/* Latest posts */}
      {latest.length > 0 && (
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-100">Latest Posts</h2>
            <Link
              to="/blog"
              className="text-sm text-cyan-400 hover:text-cyan-300"
            >
              All posts →
            </Link>
          </div>
          <ul className="space-y-3">
            {latest.map((p) => (
              <li key={p.slug}>
                <Link
                  to={`/blog/${p.slug}`}
                  className="flex items-baseline justify-between gap-4 rounded-xl border border-gray-800/80 bg-gray-900/50 px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-cyan-400/40"
                >
                  <span className="font-medium text-gray-100">{p.title}</span>
                  <time className="shrink-0 font-mono text-xs text-gray-500">
                    {p.date}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
