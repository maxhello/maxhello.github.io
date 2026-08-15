import { Link } from 'react-router-dom'
import { posts } from '../lib/posts'
import { useInView } from '../hooks/useInView'
import {
  CardRouterLink,
  NumberedSection,
  Tag,
} from '../components/ui'

const stacks = ['Backend', 'Systems', 'AI / ML', 'Go', 'Python']

/** 滚动 reveal 包装:进入视口后加 .is-visible */
function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? 'is-visible' : ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

export default function Home() {
  const latest = posts.slice(0, 3)

  return (
    <div className="space-y-24">
      {/* ── Hero:全宽排版层(星空背景由 Layout 全局提供) ── */}
      <section className="hero-breakout relative flex min-h-[85dvh] items-center">
        <div className="relative mx-auto w-full max-w-3xl px-4">
          <p className="fade-up fade-up-delay-1 font-mono text-sm text-cyan-400">
            Hi, my name is
          </p>
          <h1 className="hero-title heading-gradient fade-up fade-up-delay-2 mt-3 font-bold">
            Max Zhang.
          </h1>
          <p className="fade-up fade-up-delay-3 mt-5 max-w-xl text-lg leading-relaxed text-gray-400">
            I build <span className="text-gray-200">backend systems</span> and
            explore <span className="text-cyan-300">AI</span> and{' '}
            <span className="text-violet-300">machine learning</span>.
          </p>
          <div className="fade-up fade-up-delay-3 mt-6 flex flex-wrap gap-2">
            {stacks.map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </div>
          <div className="fade-up fade-up-delay-4 mt-9 flex gap-4">
            <a
              href="https://github.com/zhanghongzheng6"
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              GitHub →
            </a>
            <Link to="/blog" className="btn-ghost">
              Read the blog
            </Link>
          </div>
        </div>
        <a
          href="#about"
          aria-label="Scroll down"
          className="scroll-hint absolute bottom-8 left-1/2 -translate-x-1/2 text-2xl text-gray-500 hover:text-cyan-300"
        >
          ↓
        </a>
      </section>

      {/* ── 01. About ── */}
      <section id="about" className="scroll-mt-20">
        <Reveal>
          <NumberedSection number="01" title="About Me" />
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-5 max-w-2xl leading-relaxed text-gray-400">
            I'm Max, a backend / systems engineer who cares about software you
            can operate — things with health checks, honest logs, and failure
            modes you can name.{' '}
            <Link to="/about" className="link-underline text-cyan-400">
              More about me →
            </Link>
          </p>
        </Reveal>
      </section>

      {/* ── 02. Latest Posts ── */}
      {latest.length > 0 && (
        <section>
          <Reveal>
            <NumberedSection number="02" title="Latest Posts" />
          </Reveal>
          <ul className="mt-6 space-y-3">
            {latest.map((p, i) => (
              <Reveal key={p.slug} delay={i * 120}>
                <CardRouterLink
                  to={`/blog/${p.slug}`}
                  className="flex items-baseline justify-between gap-4"
                >
                  <div>
                    <span className="font-medium text-gray-100">{p.title}</span>
                    {p.tags.length > 0 && (
                      <span className="ml-3 text-xs text-gray-500">
                        {p.tags.join(' · ')}
                      </span>
                    )}
                  </div>
                  <time className="shrink-0 font-mono text-xs text-gray-500">
                    {p.date}
                  </time>
                </CardRouterLink>
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      {/* ── 03. Elsewhere ── */}
      <section>
        <Reveal>
          <NumberedSection number="03" title="Elsewhere" />
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-5 text-gray-400">
            Find me on{' '}
            <a
              href="https://github.com/zhanghongzheng6"
              target="_blank"
              rel="noreferrer"
              className="link-underline text-cyan-400"
            >
              GitHub
            </a>
            .
          </p>
        </Reveal>
      </section>
    </div>
  )
}
