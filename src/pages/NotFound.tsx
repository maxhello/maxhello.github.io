import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-gradient text-8xl font-bold">404</h1>
      <p className="mt-4 font-mono text-sm text-gray-400">
        $ curl this-page --fail<br />
        curl: (22) page not found
      </p>
      <Link
        to="/"
        className="mt-8 inline-block rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 font-medium text-white shadow-[0_0_24px_-6px_rgba(34,211,238,0.6)] transition-all hover:shadow-[0_0_32px_-4px_rgba(34,211,238,0.8)]"
      >
        ← Back to home
      </Link>
    </div>
  )
}
