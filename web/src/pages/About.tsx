import { Link } from 'react-router-dom'
import { SectionTitle } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

export default function About() {
  usePageTitle('About')
  return (
    <div className="space-y-8">
      <SectionTitle>About Me</SectionTitle>
      {/* 书信体:内容来自本人真实口述(2026-08),隐去可定位个人的细节 */}
      <div className="max-w-2xl space-y-4 leading-relaxed text-gray-300">
        <p>
          Hi, I'm Max — a backend / systems engineer interested in system
          design, performance, and lately AI.
        </p>
        <p>
          I like simple things kept simple: think the plan through first, then
          build it one module at a time.
        </p>
        <p>
          A while ago I noticed my free time quietly disappearing into short
          videos, so I traded it for learning a little every day — these days
          that's English, with a streak you can follow live on{' '}
          <Link to="/english" className="link-underline text-cyan-400">
            the dashboard
          </Link>
          .
        </p>
        <p>
          What I'm up to is on <Link to="/now" className="link-underline text-cyan-400">/now</Link>, what
          I've built is on{' '}
          <Link to="/projects" className="link-underline text-cyan-400">/projects</Link>, and
          occasional longer notes live on{' '}
          <Link to="/blog" className="link-underline text-cyan-400">/blog</Link>.
        </p>
        <p className="pt-2 text-right text-gray-400">— Max</p>
      </div>
    </div>
  )
}
