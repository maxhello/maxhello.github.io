import { languageColors, repos, type Repo } from '../lib/github'

function RepoCard({ repo }: { repo: Repo }) {
  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noreferrer"
      className="group relative block rounded-xl border border-gray-800 bg-gray-900/60 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:shadow-[0_0_30px_-8px_rgba(34,211,238,0.35)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-bold text-cyan-300 group-hover:text-cyan-200">
          {repo.name}
        </h2>
        <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
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
          <span
            key={t}
            className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-400"
          >
            {t}
          </span>
        ))}
      </div>
    </a>
  )
}

export default function Projects() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-3xl font-bold text-transparent">
          Projects
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Live from my GitHub, sorted by stars & recent activity.
        </p>
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
