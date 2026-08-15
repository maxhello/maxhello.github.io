import { NavLink, Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import ParticleField from './ParticleField'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/projects', label: 'Projects' },
  { to: '/blog', label: 'Blog' },
  { to: '/now', label: 'Now' },
  { to: '/about', label: 'About' },
]

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* 背景特效层:极光 → 星空粒子 → 网格 */}
      <div className="aurora-bg" />
      <ParticleField />
      <div className="grid-overlay" />

      <header className="sticky top-0 z-10 border-b border-gray-800/60 bg-gray-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-bold tracking-wide">
            <span className="heading-gradient">Max</span>
            <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-cyan-400 align-middle" />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 transition-colors ${
                    isActive
                      ? 'bg-gray-800/80 font-medium text-cyan-300'
                      : 'text-gray-300 hover:bg-gray-800/80 hover:text-white'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 fade-up">{children}</main>

      <footer className="border-t border-gray-800/60 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()}{' '}
        <span className="heading-gradient">Max</span> · Built with React + Vite
      </footer>
    </div>
  )
}
