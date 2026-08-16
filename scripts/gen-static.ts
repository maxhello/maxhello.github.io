/**
 * 构建前脚本:生成 public/ 下的 rss.xml / sitemap.xml / robots.txt。
 * 文章元数据解析 MDX 里的 `export const frontmatter = {...}`(与 src/lib/posts.ts 同源);
 * 单个文件解析失败只跳过并告警,不让构建挂掉。域名等统一取自 src/site.config.ts。
 * 用法: npx tsx scripts/gen-static.ts
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { site } from '../src/site.config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTS_DIR = join(__dirname, '../content/posts')
const PUB = join(__dirname, '../public')

interface PostMeta {
  slug: string
  title: string
  date: string
  excerpt?: string
}

/** 从 MDX 源码解析 frontmatter 字面量(受控格式:key: 'value') */
function parseFrontmatter(file: string): PostMeta | null {
  const src = readFileSync(join(POSTS_DIR, file), 'utf8')
  const m = src.match(/export\s+const\s+frontmatter\s*=\s*\{([\s\S]*?)\n\}/)
  if (!m) return null
  const body = m[1]
  const pick = (key: string) => body.match(new RegExp(`${key}:\\s*(['"])(.*?)\\1`))?.[2]
  const title = pick('title')
  const date = pick('date')
  if (!title || !date) {
    console.warn(`${file}: frontmatter missing title/date, skipped`)
    return null
  }
  return { slug: file.replace(/\.mdx$/, ''), title, date, excerpt: pick('excerpt') }
}

/** XML 文本转义 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function main() {
  const posts = readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .map(parseFrontmatter)
    .filter((p): p is PostMeta => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date))

  const base = site.siteUrl
  const today = new Date().toISOString().slice(0, 10)

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(site.siteName)}</title>
    <link>${base}</link>
    <description>${esc(site.siteDescription)}</description>
    <language>en</language>
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>
${posts
  .map(
    (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${base}/blog/${p.slug}</link>
      <guid isPermaLink="true">${base}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>${
        p.excerpt ? `\n      <description>${esc(p.excerpt)}</description>` : ''
      }
    </item>`,
  )
  .join('\n')}
  </channel>
</rss>
`

  const urls = [
    { loc: '/', lastmod: today },
    { loc: '/about', lastmod: today },
    { loc: '/projects', lastmod: today },
    { loc: '/blog', lastmod: today },
    { loc: '/now', lastmod: today },
    { loc: '/english', lastmod: today },
    ...posts.map((p) => ({ loc: `/blog/${p.slug}`, lastmod: p.date })),
  ]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${base}${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`,
  )
  .join('\n')}
</urlset>
`

  const robots = `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`

  mkdirSync(PUB, { recursive: true })
  writeFileSync(join(PUB, 'rss.xml'), rss)
  writeFileSync(join(PUB, 'sitemap.xml'), sitemap)
  writeFileSync(join(PUB, 'robots.txt'), robots)
  console.log(`Generated rss.xml (${posts.length} posts), sitemap.xml (${urls.length} urls), robots.txt -> ${PUB}`)
}

main()
