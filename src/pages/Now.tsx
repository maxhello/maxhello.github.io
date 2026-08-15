export default function Now() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-gradient text-3xl font-bold">Now</h1>
        <p className="mt-2 text-sm text-gray-400">
          What I'm doing, learning, and playing with right now.
        </p>
      </div>
      <div className="space-y-6 leading-relaxed text-gray-300">
        <section className="rounded-xl border border-gray-800/80 bg-gray-900/50 p-5">
          <h2 className="mb-3 font-semibold text-cyan-300">🔧 Building</h2>
          <ul className="list-disc space-y-1 pl-5 text-gray-300">
            <li>This personal site</li>
          </ul>
        </section>
        <section className="rounded-xl border border-gray-800/80 bg-gray-900/50 p-5">
          <h2 className="mb-3 font-semibold text-violet-300">📚 Learning</h2>
          <ul className="list-disc space-y-1 pl-5 text-gray-300">
            <li>AI / machine learning</li>
          </ul>
        </section>
      </div>
      <p className="font-mono text-xs text-gray-500">Last updated: Aug 2026</p>
    </div>
  )
}
