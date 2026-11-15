import { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  phase: number
  hue: 'cyan' | 'violet'
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number // 0..1 剩余寿命,拖尾随其渐隐
}

const COLORS = { cyan: [34, 211, 238], violet: [167, 139, 250] } as const
const LINK_DIST = 120 // 鼠标吸引连线半径
const PARALLAX = 0.35 // 滚动视差系数:星空以该倍速反向移动
const METEOR_EVERY = [2500, 5500] as const // 流星间隔随机区间 ms

/**
 * 全屏星空粒子层(fixed):双色星点漂移闪烁 + 滚动视差 + 偶发流星 +
 * 鼠标附近轻微连线。纯 canvas 自绘,无依赖。
 * reduced-motion 时只渲染静态星点。
 */
export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile =
      matchMedia('(pointer: coarse)').matches || innerWidth < 640

    let stars: Star[] = []
    let meteors: Meteor[] = []
    let raf = 0
    let running = false
    let scrollY = window.scrollY
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let nextMeteorAt = performance.now() + METEOR_EVERY[0]
    const mouse = { x: -9999, y: -9999 }

    const spawn = () => {
      // 粒子数按面积自适应,移动端减半;高度多铺 50% 供视差滚动用
      const count = Math.floor(
        Math.min(140, (canvas.clientWidth * canvas.clientHeight * 1.5) / 12000) /
          (isMobile ? 2 : 1),
      )
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.clientWidth,
        y: Math.random() * canvas.clientHeight * 1.5,
        r: 0.6 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.7 ? 'cyan' : 'violet',
      }))
    }

    const spawnMeteor = () => {
      // 从视口顶部偏上出发,向左下方 35-55° 斜落(重力感方向:y 正向下)
      const angle = Math.PI * (0.2 + Math.random() * 0.16)
      const speed = 9 + Math.random() * 5
      meteors.push({
        x: canvas.clientWidth * (0.2 + Math.random() * 0.8),
        y: -20, // 视口外上方入场,滑入画面
        vx: Math.cos(angle) * speed * -1, // 向左
        vy: Math.sin(angle) * speed, // 向下
        life: 1,
      })
    }

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      spawn()
      if (reduced) draw(0) // 静态模式重绘一次
    }

    const draw = (t: number) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const parallax = -(scrollY * PARALLAX) % (h * 1.5)
      ctx.clearRect(0, 0, w, h)

      for (const s of stars) {
        if (!reduced) {
          s.x += s.vx
          s.y += s.vy
          if (s.x < 0) s.x += w
          if (s.x > w) s.x -= w
          // 漂移在 1.5h 的虚拟高度内,视差偏移取模
          if (s.y < 0) s.y += h * 1.5
          if (s.y > h * 1.5) s.y -= h * 1.5
        }
        const drawY = (((s.y + parallax) % (h * 1.5)) + h * 1.5) % (h * 1.5)
        if (drawY > h + 4) continue // 视口外跳过
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s.phase + t / 900))
        const [r, g, b] = COLORS[s.hue]
        ctx.beginPath()
        ctx.arc(s.x, drawY, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${tw})`
        ctx.fill()
      }

      // 流星:位置更新 + 渐隐拖尾
      if (!reduced) {
        meteors = meteors.filter((m) => m.life > 0)
        for (const m of meteors) {
          m.x += m.vx
          m.y += m.vy
          m.life -= 0.012 // 慢一点消亡,全程可见
          const tail = 34 * m.life // 更长的拖尾
          const grad = ctx.createLinearGradient(
            m.x,
            m.y,
            m.x - m.vx * tail,
            m.y - m.vy * tail,
          )
          grad.addColorStop(0, `rgba(165,243,252,${0.95 * m.life})`)
          grad.addColorStop(1, 'rgba(165,243,252,0)')
          ctx.beginPath()
          ctx.moveTo(m.x, m.y)
          ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail)
          ctx.strokeStyle = grad
          ctx.lineWidth = 2.2 // 更粗
          ctx.stroke()
          // 头部亮点
          ctx.beginPath()
          ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(207,250,254,${0.95 * m.life})`
          ctx.fill()
        }
        if (t >= nextMeteorAt) {
          spawnMeteor()
          nextMeteorAt =
            t + METEOR_EVERY[0] + Math.random() * (METEOR_EVERY[1] - METEOR_EVERY[0])
        }
      }

      // 鼠标附近连线(移动端与 reduced 关闭)
      if (!isMobile && !reduced) {
        for (const s of stars) {
          const drawY = (((s.y + parallax) % (h * 1.5)) + h * 1.5) % (h * 1.5)
          const dx = s.x - mouse.x
          const dy = drawY - mouse.y
          const d = Math.hypot(dx, dy)
          if (d < LINK_DIST) {
            const a = (1 - d / LINK_DIST) * 0.35
            ctx.beginPath()
            ctx.moveTo(mouse.x, mouse.y)
            ctx.lineTo(s.x, drawY)
            ctx.strokeStyle = `rgba(34,211,238,${a})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }
    }

    const loop = (t: number) => {
      if (!running) return
      draw(t)
      raf = requestAnimationFrame(loop)
    }

    const start = () => {
      if (running || reduced) return
      running = true
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const onScroll = () => {
      scrollY = window.scrollY
      if (reduced) draw(0) // 静态模式也要响应视差位置
    }
    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
    }

    resize()

    if (reduced) {
      draw(0) // 静态星点,不进 rAF
      window.addEventListener('scroll', onScroll, { passive: true })
      return () => window.removeEventListener('scroll', onScroll)
    }

    start()
    const io = new IntersectionObserver(([entry]) =>
      entry.isIntersecting ? start() : stop(),
    )
    io.observe(canvas)
    const onVis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mousemove', onMouse, { passive: true })

    return () => {
      stop()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousemove', onMouse)
      if (resizeTimer) clearTimeout(resizeTimer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[-1.5] h-full w-full"
    />
  )
}
