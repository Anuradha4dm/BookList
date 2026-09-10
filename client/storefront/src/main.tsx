import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { initTheme } from '@booklist/ui'
import '@booklist/ui/tokens.css'
import '@booklist/ui/base.css'
import { router } from './App'

initTheme()

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root')
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
