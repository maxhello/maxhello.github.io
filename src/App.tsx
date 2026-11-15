import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import Projects from './pages/Projects'
import Blog from './pages/Blog'
import Post from './pages/Post'
import Now from './pages/Now'
import English from './pages/English'
import Learn from './pages/Learn'
import Tutor from './pages/Tutor'
import NotFound from './pages/NotFound'

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
    </Layout>
  )
}
