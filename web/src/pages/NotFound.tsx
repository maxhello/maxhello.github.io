import { Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'

export default function NotFound() {
  usePageTitle('404')
  return (
    <div className="py-24 text-center">
      <h1 className="heading-gradient text-8xl font-bold">404</h1>
      <p className="mt-4 font-mono text-sm text-gray-400">
        $ curl this-page --fail<br />
        curl: (22) page not found
      </p>
      <Link to="/" className="btn-primary mt-8 inline-block">
        ← Back to home
      </Link>
    </div>
  )
}
