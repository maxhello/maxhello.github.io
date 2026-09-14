import { Link } from 'react-router-dom'
import { notes } from '../lib/notes'
import { CardRouterLink, SectionSubtitle, SectionTitle, Tag } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

/** 复习笔记列表:经常蒙的点的小总结,每天学习前过一遍;入口在 English 页面 */
export default function Notes() {
  usePageTitle('Notes')
  return (
    <div className="space-y-8">
      <div>
        <Link to="/english" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back to English
        </Link>
        <div className="mt-3">
          <SectionTitle>Notes</SectionTitle>
        </div>
        <SectionSubtitle>
          Short review sheets for the things I keep mixing up — read before each day's lessons.
        </SectionSubtitle>
      </div>
      {notes.length === 0 ? (
        <p className="text-gray-500">No notes yet.</p>
      ) : (
        <ul className="space-y-4">
          {notes.map((n) => (
            <li key={n.slug}>
              <CardRouterLink to={`/notes/${n.slug}`}>
                <h2 className="text-lg font-semibold text-gray-100">{n.title}</h2>
                {n.excerpt && <p className="mt-1.5 text-sm text-gray-400">{n.excerpt}</p>}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <time className="font-mono">updated {n.updated}</time>
                  {n.tags.map((t) => (
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
