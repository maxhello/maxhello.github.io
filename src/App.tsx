import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import Projects from './pages/Projects'
import Blog from './pages/Blog'
import Post from './pages/Post'
import Now from './pages/Now'
import English from './pages/English'
import Notes from './pages/Notes'
import Note from './pages/Note'
import NotFound from './pages/NotFound'

export default function App() {
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
        {/* Notes 不进顶部导航,从 English 页面进入 */}
        <Route path="/notes" element={<Notes />} />
        <Route path="/notes/:slug" element={<Note />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}
