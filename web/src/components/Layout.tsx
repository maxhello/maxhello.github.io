import { NavLink, Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import ParticleField from './ParticleField'
import { site } from '../site.config'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/projects', label: 'Projects' },
  { to: '/blog', label: 'Blog' },
  { to: '/now', label: 'Now' },
  { to: '/english', label: 'English' },
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
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
          <Link to="/" className="group flex items-center gap-2.5 font-bold tracking-wide">
            <img
              src={`https://github.com/${site.githubUser}.png`}
              alt="Max"
              width={28}
              height={28}
              className="size-7 rounded-full border border-cyan-400/40 object-cover transition-all duration-300 group-hover:border-cyan-300 group-hover:shadow-[0_0_16px_-4px_rgba(34,211,238,0.8)]"
            />
            <span className="heading-gradient">Max</span>
            <span className="inline-block size-2 animate-pulse rounded-full bg-cyan-400 align-middle" />
          </Link>
          {/* 窄屏允许横向滚动兜底,避免 6 个导航项挤爆 375px */}
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `shrink-0 rounded-lg px-2 py-1.5 transition-colors sm:px-3 ${
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
