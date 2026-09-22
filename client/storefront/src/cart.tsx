import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSession } from './auth'

export type CartLine = {
  id: number
  packId: number
  sequence: number
  gradeName: string
  label: string
}

type CartBadge = {
  count: number
  refresh: () => void
}

const CartBadgeContext = createContext<CartBadge | null>(null)

export function useCartBadge(): CartBadge {
  const value = useContext(CartBadgeContext)
  if (!value) throw new Error('Cart badge is missing')
  return value
}

export function CartBadgeProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const [count, setCount] = useState(0)
  const refreshGen = useRef(0)
  const sessionStatusRef = useRef(session.status)
  sessionStatusRef.current = session.status

  const refresh = useCallback(() => {
    if (session.status !== 'in') {
      refreshGen.current += 1
      setCount(0)
      return
    }
    const gen = ++refreshGen.current
    void fetch('/api/cart', { credentials: 'include' })
      .then(async (response) => {
        if (gen !== refreshGen.current || sessionStatusRef.current !== 'in') return
        if (!response.ok) {
          setCount(0)
          return
        }
        const body = (await response.json()) as { lines?: CartLine[] }
        if (gen !== refreshGen.current || sessionStatusRef.current !== 'in') return
        setCount(Array.isArray(body.lines) ? body.lines.length : 0)
      })
      .catch(() => {
        if (gen !== refreshGen.current || sessionStatusRef.current !== 'in') return
        setCount(0)
      })
  }, [session.status])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <CartBadgeContext.Provider value={{ count, refresh }}>{children}</CartBadgeContext.Provider>
  )
}
