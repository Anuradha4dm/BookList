import { useEffect, useState } from 'react'
import { Spinner } from '@booklist/ui'
import { useCartBadge, type CartLine } from './cart'

const UNREACHABLE = 'Could not reach the shop. Try again.'

type Status = 'loading' | 'ready' | 'error'

type ApiError = {
  error?: { message?: string }
}

export function CartPage() {
  const { refresh } = useCartBadge()
  const [lines, setLines] = useState<CartLine[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setErrorMessage('')
    void fetch('/api/cart', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | ({ lines?: CartLine[] } & ApiError)
          | null
        if (!response.ok) {
          const message = body?.error?.message
          return {
            ok: false as const,
            message:
              typeof message === 'string' && message.trim() ? message : 'Could not load the cart.',
          }
        }
        return {
          ok: true as const,
          lines: Array.isArray(body?.lines) ? body.lines : [],
        }
      })
      .then((result) => {
        if (controller.signal.aborted) return
        if (!result.ok) {
          setErrorMessage(result.message)
          setStatus('error')
          return
        }
        setLines(result.lines)
        setStatus('ready')
        refresh()
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setErrorMessage(UNREACHABLE)
        setStatus('error')
        void err
      })
    return () => controller.abort()
  }, [refresh])

  if (status === 'error') {
    return (
      <section>
        <p className="form-error text-meta" role="alert">
          {errorMessage}
        </p>
      </section>
    )
  }
  if (status === 'loading') return <Spinner />

  return (
    <section className="cart-screen">
      <h1 className="page-heading text-heading-lg">Cart</h1>
      {lines.length === 0 ? null : (
        <ul className="cart-line-list">
          {lines.map((line) => (
            <li key={line.id} className="cart-line">
              <span
                className={
                  line.sequence === 1 ? 'cart-line-chip is-first' : 'cart-line-chip is-later'
                }
              >
                {line.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
