import { useEffect, useRef } from 'react'

/**
 * giscus 评论(基于 GitHub Discussions)。
 * 使用前需要:
 *  1. 仓库开启 Discussions(Settings → General → Features)
 *  2. 安装 giscus app: https://github.com/apps/giscus
 *  3. 到 https://giscus.app 生成 repoId / categoryId 填到下方
 */
function Giscus() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://giscus.app/client.js'
    script.async = true
    script.crossOrigin = 'anonymous'
    script.setAttribute('data-repo', 'zhanghongzheng6/zhanghongzheng6.github.io')
    script.setAttribute('data-repo-id', 'R_kgDORrItCQ')
    script.setAttribute('data-category', 'Announcements')
    script.setAttribute('data-category-id', 'DIC_kwDORrItCc4DDaPd')
    script.setAttribute('data-mapping', 'pathname')
    script.setAttribute('data-strict', '0')
    script.setAttribute('data-reactions-enabled', '1')
    script.setAttribute('data-emit-metadata', '0')
    script.setAttribute('data-input-position', 'bottom')
    script.setAttribute('data-theme', 'transparent_dark')
    script.setAttribute('data-lang', 'en')
    ref.current?.appendChild(script)
  }, [])

  return <div ref={ref} />
}

export default function Comments() {
  return (
    <section className="mt-12 border-t border-gray-800 pt-8">
      <h2 className="mb-4 text-lg font-semibold text-gray-200">Comments</h2>
      <Giscus />
    </section>
  )
}
