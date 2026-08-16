import { Card, SectionSubtitle, SectionTitle } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

const sections = [
  {
    icon: '🔧',
    title: 'Building',
    titleClass: 'text-cyan-300',
    items: ['This personal site'],
  },
  {
    icon: '📚',
    title: 'Learning',
    titleClass: 'text-violet-300',
    items: ['AI / machine learning'],
  },
]

export default function Now() {
  usePageTitle('Now')
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>Now</SectionTitle>
        <SectionSubtitle>
          What I'm doing, learning, and playing with right now — inspired by{' '}
          <a
            href="https://nownownow.com/"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 hover:text-cyan-300"
          >
            /now pages
          </a>
          .
        </SectionSubtitle>
      </div>
      <div className="space-y-4">
        {sections.map((s) => (
          <Card key={s.title}>
            <h2 className={`mb-3 font-semibold ${s.titleClass}`}>
              {s.icon} {s.title}
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-gray-300">
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="font-mono text-xs text-gray-500">Last updated: Aug 2026</p>
    </div>
  )
}
