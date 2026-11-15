import { lazy, Suspense, type ComponentType } from 'react'
import { Route, Routes } from 'react-router-dom'
import { learningReady } from './lib/learning'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import Projects from './pages/Projects'
import Blog from './pages/Blog'
import Post from './pages/Post'
import Tutor from './pages/Tutor'
import NotFound from './pages/NotFound'

/**
 * 用学习数据的页面:模块加载时就把派生数据算好了,所以必须等数据到位再加载模块;
 * 接口取不到数据时不加载页面模块,显示 DataUnavailable。详见 lib/learning.ts。
 */
const dataPage = (load: () => Promise<{ default: ComponentType }>) =>
  lazy(() => learningReady.then((ok) => (ok ? load() : { default: DataUnavailable })))
const Now = dataPage(() => import('./pages/Now'))
const English = dataPage(() => import('./pages/English'))
const Learn = dataPage(() => import('./pages/Learn'))

export default function App() {
  return (
    <Routes>
      {/* 口语陪练是全屏通话页,不套 Layout */}
      <Route path="/english/tutor" element={<Tutor />} />
      <Route path="/*" element={<SitePages />} />
    </Routes>
  )
}

function SitePages() {
  return (
    <Layout>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<Post />} />
        <Route path="/now" element={<Now />} />
        <Route path="/english" element={<English />} />
        <Route path="/english/learn" element={<Learn />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </Layout>
  )
}

function DataUnavailable() {
  return (
    <div className="py-24 text-center">
      <p className="text-gray-300">Learning data is temporarily unavailable.</p>
      <p className="mt-2 text-sm text-gray-500">The data service did not respond — please try again later.</p>
    </div>
  )
}
