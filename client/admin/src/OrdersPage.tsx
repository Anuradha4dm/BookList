import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  ORDER_STATUSES,
  Skeleton,
  StatusPill,
  formatRupees,
  type OrderStatus,
} from '@booklist/ui'
import { useAdminAuth } from './auth'
import {
  NEEDS_CALL_STATUS,
  adminOrderSections,
  adminOrdersPath,
  isPastStatus,
  parseAdminOrders,
  statusFilterFrom,
  withStatusFilter,
  type AdminOrder,
} from './orders'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const SIGN_IN_AGAIN = 'Sign in to continue.'
const LOAD_FAILED = 'Could not load the orders. Try again.'
const FILTER_ID = 'admin-order-status-filter'

type ApiError = {
  error?: { code?: string; message?: string }
}

function apiMessage(body: ApiError | null, fallback: string): string {
  const message = body?.error?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

const COLOMBO_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

type ColomboParts = { day: string; year: string; time: string }

/** `{ day: '2 Oct', year: '2026', time: '9:15 am' }` in Asia/Colombo; undefined if unreadable. */
function colomboParts(at: number): ColomboParts | undefined {
  if (!Number.isFinite(at)) return undefined
  const parts = COLOMBO_PARTS.formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? ''
  const period = part('dayPeriod').toLowerCase()
  const clock = `${part('hour')}:${part('minute')}`
  return {
    day: `${part('day')} ${part('month')}`,
    year: part('year'),
    time: period ? `${clock} ${period}` : clock,
  }
}

/** `1 Oct 2026, 9:15 am` in Asia/Colombo. */
export function placedAtCopy(iso: string): string {
  const parts = colomboParts(Date.parse(iso))
  return parts ? `${parts.day} ${parts.year}, ${parts.time}` : iso
}

/** `Called 6:35 pm · no answer` today in Colombo; earlier days also name the day. */
export function calledCopy(iso: string, now: number = Date.now()): string {
  const parts = colomboParts(Date.parse(iso))
  if (!parts) return `Called ${iso} · no answer`
  const today = colomboParts(now)
  const sameDay = today !== undefined && today.day === parts.day && today.year === parts.year
  return `Called ${sameDay ? parts.time : `${parts.day}, ${parts.time}`} · no answer`
}

function RingGlyph() {
  return (
    <svg
      className="admin-order-call-glyph"
      viewBox="0 0 14 14"
      width={12}
      height={12}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
    >
      <circle cx="7" cy="7" r="5" strokeWidth="2.6" />
    </svg>
  )
}

function HandsetGlyph() {
  return (
    <svg
      className="admin-order-call-glyph"
      viewBox="0 0 14 14"
      width={12}
      height={12}
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M3.2 1.2l2.2 2.6-1.2 1.6c.7 1.6 1.9 2.8 3.5 3.5l1.6-1.2 2.6 2.2-1.1 2.1C5.5 11.8 2.2 8.5 1.1 3.3z" />
      <path d="M8.6 1.4l4 4" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  )
}

function BooksMark() {
  return (
    <svg
      className="admin-order-empty-mark"
      viewBox="0 0 46 46"
      width={46}
      height={46}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <rect x="6" y="30" width="34" height="9" />
      <rect x="9" y="20" width="28" height="10" />
      <rect x="12" y="9" width="22" height="11" />
    </svg>
  )
}

/** Shown only while the order still owes a call: never-called and called-no-answer differ. */
export function CallChip({
  callAttemptedAt,
  now,
}: {
  callAttemptedAt: string | null
  now?: number
}) {
  if (callAttemptedAt === null) {
    return (
      <span className="admin-order-call admin-order-call-never">
        <RingGlyph />
        <span>Not called yet</span>
      </span>
    )
  }
  return (
    <span className="admin-order-call admin-order-call-attempted">
      <HandsetGlyph />
      <span>{calledCopy(callAttemptedAt, now)}</span>
    </span>
  )
}

function lineCountCopy(count: number): string {
  return count === 1 ? '1 line' : `${count} lines`
}

function OrderRow({ order, now }: { order: AdminOrder; now?: number }) {
  const needsCall = order.status === NEEDS_CALL_STATUS
  return (
    <li className={needsCall ? 'admin-order-row is-attention' : 'admin-order-row'}>
      <div className="admin-order-id">
        <p className="admin-order-number text-heading-sm">#{order.publicNumber}</p>
        <p className="admin-order-time text-meta">{placedAtCopy(order.placedAt)}</p>
      </div>
      <div className="admin-order-parent">
        <p className="admin-order-name text-body-strong">{order.parentName}</p>
        <p className="admin-order-meta text-meta">
          {order.whatsapp} · {lineCountCopy(order.lineCount)} · {formatRupees(order.goodsTotal)}
        </p>
      </div>
      <p className="admin-order-lines text-meta" title={order.linesSummary}>
        {order.linesSummary}
      </p>
      <div className="admin-order-status">
        <StatusPill status={order.status} />
      </div>
      <div className="admin-order-call-cell">
        {needsCall ? <CallChip callAttemptedAt={order.callAttemptedAt} now={now} /> : null}
      </div>
    </li>
  )
}

function EmptyCard({
  title,
  action,
  onAction,
  disabled,
}: {
  title: string
  action: string
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <div className="admin-order-empty">
      <BooksMark />
      <p className="admin-order-empty-title text-heading-sm">{title}</p>
      <button
        type="button"
        className="button-primary press-travel"
        disabled={disabled}
        onClick={onAction}
      >
        {action}
      </button>
    </div>
  )
}

type BoardProps = {
  orders: AdminOrder[]
  filter: OrderStatus | null
  busy?: boolean
  /** The clock the call chips compare against; defaults to now. */
  now?: number
  onFilterChange: (status: OrderStatus | null) => void
  onRefresh: () => void
}

/** Everything under the heading: the filter, then the empty card or the Open and Past sections. */
export function AdminOrdersBoard({
  orders,
  filter,
  busy,
  now,
  onFilterChange,
  onRefresh,
}: BoardProps) {
  const sections = adminOrderSections(orders, filter)
  const matches = sections.some((section) => section.groups.length > 0)
  // Under a filter only the section that status belongs to is shown.
  const shown =
    filter === null
      ? sections
      : sections.filter((section) => (section.key === 'past') === isPastStatus(filter))

  let body
  if (orders.length === 0) {
    body = <EmptyCard title="No orders yet." action="Refresh" onAction={onRefresh} disabled={busy} />
  } else if (filter !== null && !matches) {
    body = (
      <EmptyCard
        title={`No ${filter} orders.`}
        action="Show all statuses"
        onAction={() => onFilterChange(null)}
        disabled={busy}
      />
    )
  } else {
    body = shown.map((section) => (
      <section
        key={section.key}
        className="admin-order-section"
        aria-labelledby={`admin-order-section-${section.key}`}
      >
        <h2 id={`admin-order-section-${section.key}`} className="admin-order-section-title text-heading-md">
          {section.title}
        </h2>
        {section.groups.length === 0 ? (
          <p className="admin-order-section-empty text-meta">{section.emptyCopy}</p>
        ) : (
          section.groups.map((group) => (
            <div key={group.status} className="admin-order-group">
              <h3 className="admin-order-group-header">
                <span className="admin-order-group-title text-heading-sm">{group.status}</span>
                <span className="admin-order-group-count">
                  {group.orders.length}
                  <span className="visually-hidden">
                    {group.orders.length === 1 ? ' order' : ' orders'}
                  </span>
                </span>
              </h3>
              <ul className="admin-order-list">
                {group.orders.map((order) => (
                  <OrderRow key={order.id} order={order} now={now} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    ))
  }

  return (
    <>
      <div className="admin-order-filter form-field">
        <label className="text-label-caps" htmlFor={FILTER_ID}>
          Status
        </label>
        <select
          id={FILTER_ID}
          className="form-control"
          value={filter ?? ''}
          onChange={(event) => onFilterChange(statusFilterFrom(event.target.value))}
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      {body}
    </>
  )
}

export function OrdersPage() {
  const { signOut } = useAdminAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = statusFilterFrom(searchParams.get('status'))
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut

  /** Fetches the list, aborting any earlier fetch; a failed refetch keeps the last good list. */
  const load = useCallback(async (): Promise<void> => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    try {
      const response = await fetch(adminOrdersPath(), {
        credentials: 'include',
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (response.status === 401) {
        // Drop the list first so no parent contacts linger behind the sign-in prompt.
        setOrders([])
        try {
          await signOutRef.current()
        } catch {
          // Signing out locally failed too; the prompt below is still the right message.
        }
        if (controller.signal.aborted) return
        setError(SIGN_IN_AGAIN)
        return
      }
      const body = (await response.json().catch(() => null)) as unknown
      if (controller.signal.aborted) return
      if (!response.ok) {
        setError(apiMessage(body as ApiError | null, LOAD_FAILED))
        return
      }
      const parsed = parseAdminOrders(body)
      if (!parsed) {
        setError(LOAD_FAILED)
        return
      }
      setOrders(parsed)
      setError('')
    } catch {
      if (controller.signal.aborted) return
      setError(UNREACHABLE)
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setBusy(false)
        setLoaded(true)
      }
    }
  }, [])

  useEffect(() => {
    void load()
    return () => controllerRef.current?.abort()
  }, [load])

  const refresh = () => void load()

  const changeFilter = (status: OrderStatus | null) => {
    setSearchParams((current) => withStatusFilter(current, status), { replace: true })
  }

  return (
    <section className="admin-orders">
      <div className="admin-orders-heading">
        <h1 className="page-heading text-heading-lg">Orders</h1>
        <button
          type="button"
          className="button-secondary press-travel"
          disabled={busy}
          onClick={refresh}
        >
          Refresh
        </button>
      </div>
      {!loaded ? (
        <Skeleton />
      ) : (
        <>
          {error ? (
            <p className="form-error text-meta" role="alert">
              {error}
            </p>
          ) : null}
          {error && orders.length === 0 ? null : (
            <AdminOrdersBoard
              orders={orders}
              filter={filter}
              busy={busy}
              onFilterChange={changeFilter}
              onRefresh={refresh}
            />
          )}
        </>
      )}
    </section>
  )
}
