import { useEffect, useRef, useState } from 'react'

/** 元素进入视口时返回 true(一次性),用于滚动 reveal */
export function useInView<T extends HTMLElement>(rootMargin = '-40px') {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  return { ref, inView }
}
