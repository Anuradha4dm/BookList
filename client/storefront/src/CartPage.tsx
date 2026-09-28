import { useEffect, useState } from 'react'
import { Spinner } from '@booklist/ui'
import { useCartBadge, type CartLine } from './cart'

const UNREACHABLE = 'Could not reach the shop. Try again.'

type Status = 'loading' | 'ready' | 'error'

type ApiError = {
  error?: { message?: string }
}

function parseLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return []
  const lines: CartLine[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const line = entry as Record<string, unknown>
    if (line.kind === 'pack') {
      if (
        typeof line.id === 'number' &&
        typeof line.packId === 'number' &&
        typeof line.sequence === 'number' &&
        typeof line.gradeName === 'string' &&
        typeof line.label === 'string'
      ) {
        lines.push({
          kind: 'pack',
          id: line.id,
          packId: line.packId,
          sequence: line.sequence,
          gradeName: line.gradeName,
          label: line.label,
        })
      }
      continue
    }
    if (line.kind === 'item') {
      if (
        typeof line.id === 'number' &&
        typeof line.itemId === 'number' &&
        typeof line.quantity === 'number' &&
        typeof line.title === 'string' &&
        typeof line.unitPrice === 'number'
      ) {
        lines.push({
          kind: 'item',
          id: line.id,
          itemId: line.itemId,
          quantity: line.quantity,
          title: line.title,
          unitPrice: line.unitPrice,
        })
      }
    }
  }
  return lines
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
          | ({ lines?: unknown } & ApiError)
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
          lines: parseLines(body?.lines),
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
          {lines.map((line) =>
            line.kind === 'pack' ? (
              <li key={`pack-${line.id}`} className="cart-line">
                <span
                  className={
                    line.sequence === 1 ? 'cart-line-chip is-first' : 'cart-line-chip is-later'
                  }
                >
                  {line.label}
                </span>
              </li>
            ) : (
              <li key={`item-${line.id}`} className="cart-line">
                <p className="cart-item-line text-body-strong">
                  {line.title} {'\u00d7'} {line.quantity}
                </p>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}
