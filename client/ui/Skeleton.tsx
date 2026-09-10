export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton-check" />
          <span className="skeleton-lines">
            <span className="skeleton-bar" />
            <span className="skeleton-bar skeleton-bar-short" />
          </span>
        </div>
      ))}
    </div>
  )
}
