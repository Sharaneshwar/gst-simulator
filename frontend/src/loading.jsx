import "./loading.css";

export function Spinner({ label, className = "" }) {
  return (
    <span
      className={`spinner ${className}`}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
export function Skeleton({ width, height, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`}
      style={{ width, height }}
    />
  );
}
export function InlineLoader({ label = "Loading data" }) {
  return (
    <span className="inline-loader" role="status" aria-label={label}>
      <Spinner />
      <Skeleton width="110px" height="10px" />
    </span>
  );
}
export function TableSkeleton({
  columns = 5,
  rows = 5,
  label = "Loading table",
}) {
  return (
    <div
      className="table-skeleton"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: rows + 1 }, (_, row) => (
        <div
          key={row}
          className={`skeleton-table-row ${row === 0 ? "skeleton-table-head" : ""}`}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton key={col} width={col % 2 ? "90%" : "70%"} height="13px" />
          ))}
        </div>
      ))}
    </div>
  );
}
export function PageSkeleton() {
  return (
    <div
      className="container page-space portal-skeleton"
      role="status"
      aria-label="Loading portal"
      aria-busy="true"
    >
      <Skeleton width="180px" height="14px" />
      <Skeleton width="min(350px, 85%)" height="32px" />
      <div className="skeleton-cards">
        {[0, 1, 2].map((key) => (
          <div className="skeleton-card" key={key}>
            <Skeleton width="50%" height="15px" />
            <Skeleton width="75%" height="25px" />
            <Skeleton width="60%" height="12px" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}
export function RequestProgress() {
  return (
    <div
      className="request-progress"
      role="progressbar"
      aria-label="Updating data"
    >
      <span />
    </div>
  );
}
