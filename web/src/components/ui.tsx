import type { ReactNode, AnchorHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

/** 区块大标题:渐变字,全站页面主标题统一用它 */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="heading-gradient text-3xl font-bold">{children}</h1>
  )
}

/** 编号区块标题:01. About 这种,首页长滚动叙事用 */
export function NumberedSection({
  number,
  title,
  id,
}: {
  number: string
  title: string
  id?: string
}) {
  return (
    <h2
      id={id}
      className="flex items-center gap-4 text-2xl font-bold text-gray-100"
    >
      <span className="font-mono text-lg text-cyan-400">{number}.</span>
      {title}
      <span className="h-px flex-1 bg-gray-800" />
    </h2>
  )
}

/** 页面副标题:页面主标题下的一行说明 */
export function SectionSubtitle({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-gray-400">{children}</p>
}

/** 卡片容器:可作 div 或 a(外链)/Link(内链) */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`card p-5 ${className}`}>{children}</div>
}

/** 链接卡片:包住整块内容的可点击卡片(外链) */
export function CardLink({
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className="card block p-5" {...props}>
      {children}
    </a>
  )
}

/** 内链卡片(react-router) */
export function CardRouterLink({
  children,
  ...props
}: LinkProps & { children: ReactNode }) {
  return (
    <Link className="card block p-5" {...props}>
      {children}
    </Link>
  )
}

/** 小标签 */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>
}
