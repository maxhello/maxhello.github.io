import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

export default defineConfig({
  plugins: [
    react(),
    // remark-gfm:让 MDX 认 GFM 表格(Notes 里大量句型表),rehype-highlight:代码高亮
    mdx({ remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHighlight] }),
    tailwindcss(),
  ],
  // GitHub Pages 托管在 <user>.github.io 根路径,不需要 base
  // 若以后部署到子路径,改成对应 base
})
