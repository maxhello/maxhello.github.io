import { languageColors, repos, type Repo } from '../lib/github'
import { CardLink, SectionSubtitle, SectionTitle, Tag } from '../components/ui'

function RepoCard({ repo }: { repo: Repo }) {
  return (
    <CardLink href={repo.html_url} target="_blank" rel="noreferrer">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-bold text-cyan-300">{repo.name}</h2>
        <span className="shrink-0 text-xs text-gray-400">
          ★ {repo.stargazers_count}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm text-gray-400">
        {repo.description ?? 'No description.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        {repo.language && (
          <span className="flex items-center gap-1.5 text-gray-300">
            <span
              className="size-2.5 rounded-full"
              style={{ background: languageColors[repo.language] ?? '#8b949e' }}
            />
            {repo.language}
          </span>
        )}
        {repo.topics.slice(0, 3).map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
    </CardLink>
  )
}

export default function Projects() {
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>Projects</SectionTitle>
        <SectionSubtitle>
          Live from my GitHub, sorted by stars & recent activity.
        </SectionSubtitle>
      </div>

      {repos.length === 0 && (
        <p className="text-gray-500">No repositories found.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {repos.map((r) => (
          <RepoCard key={r.id} repo={r} />
        ))}
      </div>
    </div>
  )
}
