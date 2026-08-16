import { SectionTitle } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

export default function About() {
  usePageTitle('About')
  return (
    <div className="space-y-8">
      <SectionTitle>About Me</SectionTitle>
      <div className="space-y-4 leading-relaxed text-gray-300">
        <p>
          I'm <span className="text-cyan-300">Max</span> (Zhang), a backend /
          systems engineer interested in system design, performance, and
          lately AI and machine learning.
        </p>
        <p className="text-sm text-gray-500">
          (Timeline and skills breakdown coming soon — real content only.)
        </p>
      </div>
    </div>
  )
}
