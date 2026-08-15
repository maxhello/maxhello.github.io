export default function About() {
  return (
    <div className="space-y-8">
      <h1 className="text-gradient text-3xl font-bold">About Me</h1>
      <div className="space-y-4 leading-relaxed text-gray-300">
        <p>
          I'm <span className="text-cyan-300">Max</span> (Zhang), a backend /
          systems engineer. I care about system design and performance, and
          lately I've been going deep on{' '}
          <span className="text-violet-300">AI and machine learning</span>.
        </p>
        <p className="text-sm text-gray-500">
          (A timeline and skills breakdown are coming.)
        </p>
      </div>
    </div>
  )
}
