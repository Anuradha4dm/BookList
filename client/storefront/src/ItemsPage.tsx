import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Spinner, formatRupees } from '@booklist/ui'
import { browseItemsPath, type BrowseItem } from './browse'

const EMPTY_COPY = 'we are working on this now'
const UNREACHABLE = 'Could not reach the shop. Try again.'

export function ItemsPage() {
  const [items, setItems] = useState<BrowseItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(browseItemsPath(), { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('load failed')
        return (await response.json()) as BrowseItem[]
      })
      .then((list) => {
        setItems(list)
        setError('')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setItems([])
        setError(UNREACHABLE)
        void err
      })
    return () => controller.abort()
  }, [])

  const ready = items !== null
  const empty = ready && items.length === 0 && !error

  return (
    <section>
      <h1 className="page-heading text-heading-lg">Items</h1>
      <p className="text-meta">
        <Link to="/">Packs</Link>
      </p>
      {error ? (
        <p className="form-error text-meta" role="alert">
          {error}
        </p>
      ) : null}
      {!ready ? <Spinner /> : null}
      {empty ? <p className="text-meta">{EMPTY_COPY}</p> : null}
      {ready && items.length > 0 ? (
        <ul className="catalog-list">
          {items.map((item) => (
            <li key={item.id} className="catalog-row">
              <p className="catalog-row-name">{item.title}</p>
              <p className="text-meta">{item.description}</p>
              <p className="text-amount-row">{formatRupees(item.price)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
