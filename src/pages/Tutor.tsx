import { lazy, Suspense, useEffect } from 'react'

/**
 * AI 口语陪练页(/english/tutor)。全屏通话界面,不套站点 Layout(无导航、无星空背景)。
 * 实现在 src/tutor/,整体懒加载:livekit-client 很大,只在进这个页面时才下载。
 */
const TutorApp = lazy(async () => {
  await import('../tutor/tutor.css')
  return import('../tutor/Tutor')
})

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'

export default function Tutor() {
  // 该页自己的字体与 noindex(个人练习页,不进搜索),离开时撤掉
  useEffect(() => {
    const font = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONT_HREF })
    const robots = Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex' })
    document.head.append(font, robots)
    return () => {
      font.remove()
      robots.remove()
    }
  }, [])
  return (
    <div className="tutor-app">
      <Suspense fallback={null}>
        <TutorApp />
      </Suspense>
    </div>
  )
}
