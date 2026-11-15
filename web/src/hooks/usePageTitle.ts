import { useEffect } from 'react'
import { site } from '../site.config'

/** 路由级 document.title:传页面名 → `Blog · Max Zhang`;不传 → 站点默认标题 */
export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page
      ? `${page} · ${site.siteName}`
      : `${site.siteName} · ${site.tagline}`
  }, [page])
}
