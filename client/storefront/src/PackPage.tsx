import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Spinner, formatRupees } from '@booklist/ui'
import { browsePackPath, type BrowsePackDetail } from './browse'
import {
  configuredLines,
  decreaseChoice,
  increaseChoice,
  initialChoices,
  lockedBookId,
  runningTotal,
  toggleChoice,
  QUANTITY_MAX,
  QUANTITY_MIN,
  type Choices,
} from './packConfig'

const EMPTY_COPY = 'we are working on this now'
const UNREACHABLE = 'Could not reach the shop. Try again.'
const LOCKED_COPY = 'Keep at least one book to add this pack.'
const CAP_COPY = 'Item count exeeded, you can only order 20 per item'

type Status = 'loading' | 'ready' | 'missing' | 'unreachable'

function packIdFrom(param: string): number | undefined {
  if (!/^[1-9]\d*$/.test(param)) return undefined
  const id = Number(param)
  return Number.isSafeInteger(id) ? id : undefined
}

export function PackPage() {
  const packId = packIdFrom(useParams().id ?? '')
  const [detail, setDetail] = useState<BrowsePackDetail | null>(null)
  const [choices, setChoices] = useState<Choices>({})
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (packId === undefined) {
      setDetail(null)
      setStatus('missing')
      return
    }
    const controller = new AbortController()
    setDetail(null)
    setStatus('loading')
    void fetch(browsePackPath(packId), { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return null
        if (!response.ok) throw new Error('load failed')
        return (await response.json()) as BrowsePackDetail
      })
      .then((body) => {
        if (!body) {
          setStatus('missing')
          return
        }
        setDetail(body)
        setChoices(initialChoices(body))
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setStatus('unreachable')
        void err
      })
    return () => controller.abort()
  }, [packId])

  const books = detail?.books ?? []
  const lines = useMemo(() => configuredLines(books, choices), [books, choices])
  const total = useMemo(() => runningTotal(lines), [lines])
  const locked = lockedBookId(lines)

  if (status === 'missing') return null
  if (status === 'unreachable') {
    return (
      <section>
        <p className="form-error text-meta" role="alert">
          {UNREACHABLE}
        </p>
      </section>
    )
  }
  if (status === 'loading' || !detail) return <Spinner />

  return (
    <section className="pack-screen">
      <h1 className="page-heading text-heading-lg">{detail.name}</h1>
      <p className="text-meta">{detail.description}</p>
      {books.length === 0 ? (
        <p className="text-meta">{EMPTY_COPY}</p>
      ) : (
        <div className="pack-layout">
          <ul className="pack-list">
            {books.map((book) => {
              const choice = choices[book.id] ?? { ticked: false, quantity: QUANTITY_MIN }
              const isLocked = book.id === locked
              const atCap = choice.ticked && choice.quantity >= QUANTITY_MAX
              const lockedNoticeId = `pack-locked-${book.id}`
              const capNoticeId = `pack-cap-${book.id}`
              return (
                <li
                  key={book.id}
                  className={`pack-row${choice.ticked ? '' : ' is-off'}${isLocked ? ' is-locked' : ''}`}
                >
                  <div className="pack-row-main">
                    <label className="pack-check">
                      <input
                        type="checkbox"
                        className="pack-check-box"
                        checked={choice.ticked}
                        disabled={isLocked}
                        aria-describedby={isLocked ? lockedNoticeId : undefined}
                        onChange={() => setChoices((current) => toggleChoice(current, book.id))}
                      />
                      <span className="pack-row-title text-body-strong">{book.title}</span>
                    </label>
                    <p className="pack-row-unit text-meta">{formatRupees(book.price)} each</p>
                  </div>
                  {choice.ticked ? (
                    <div className="pack-row-controls">
                      <div className="pack-stepper">
                        <button
                          type="button"
                          className="pack-stepper-end"
                          disabled={isLocked && choice.quantity === QUANTITY_MIN}
                          aria-describedby={isLocked ? lockedNoticeId : undefined}
                          onClick={() => setChoices((current) => decreaseChoice(current, book.id))}
                          aria-label={`Fewer copies of ${book.title}`}
                        >
                          {'\u2212'}
                        </button>
                        <span className="pack-stepper-value text-amount-row">{choice.quantity}</span>
                        <button
                          type="button"
                          className="pack-stepper-end"
                          disabled={atCap}
                          aria-describedby={atCap ? capNoticeId : undefined}
                          onClick={() => setChoices((current) => increaseChoice(current, book.id))}
                          aria-label={`More copies of ${book.title}`}
                        >
                          {'+'}
                        </button>
                      </div>
                      <p className="pack-row-amount text-amount-row">
                        {formatRupees(book.price * choice.quantity)}
                      </p>
                    </div>
                  ) : null}
                  {isLocked ? (
                    <p className="pack-row-notice text-meta" id={lockedNoticeId}>
                      {LOCKED_COPY}
                    </p>
                  ) : null}
                  {atCap ? (
                    <p className="pack-row-notice text-meta" id={capNoticeId}>
                      {CAP_COPY}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <aside className="pack-summary" aria-label="Running total">
            <p className="pack-summary-label text-label-caps">Total</p>
            <p className="pack-summary-total text-amount-hero" aria-live="polite">
              {formatRupees(total)}
            </p>
            <ul className="pack-summary-lines">
              {lines.map((line) => (
                <li key={line.book.id} className="pack-summary-line">
                  <span className="pack-summary-line-title text-meta">
                    {line.book.title} {'\u00d7'} {line.quantity}
                  </span>
                  <span className="pack-summary-line-amount text-amount-row">
                    {formatRupees(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </section>
  )
}
