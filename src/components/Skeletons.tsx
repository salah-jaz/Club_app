/**
 * StatCardSkeleton — shimmer skeleton that exactly mirrors
 * the shape and size of a dashboard Stat card.
 */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#131916] p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Label */}
          <div className="skeleton-shimmer h-3 w-24 mb-3 rounded" />
          {/* Value */}
          <div className="skeleton-shimmer h-8 w-16 mb-2 rounded" />
          {/* Hint */}
          <div className="skeleton-shimmer h-2.5 w-20 rounded" />
        </div>
        {/* Icon */}
        <div className="skeleton-shimmer size-10 rounded-lg shrink-0 ml-3" />
      </div>
    </div>
  );
}

/**
 * StatCardSkeletonGrid — 4 stat card skeletons in a responsive grid.
 */
export function StatCardSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * TableRowSkeleton — a single shimmer table row with `cols` columns.
 */
export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div
            className="skeleton-shimmer rounded"
            style={{ height: 14, width: i === 0 ? "70%" : i === cols - 1 ? "40%" : "55%" }}
          />
        </td>
      ))}
    </tr>
  );
}

/**
 * TableSkeleton — full shimmer table with configurable row/col count.
 */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
    </tbody>
  );
}

/**
 * CardGridSkeleton — generic shimmer skeletons for card grids (e.g. member cards).
 */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#131916] p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="skeleton-shimmer size-10 rounded-full shrink-0" />
            <div className="flex-1">
              <div className="skeleton-shimmer h-4 w-32 mb-2 rounded" />
              <div className="skeleton-shimmer h-3 w-20 rounded" />
            </div>
          </div>
          <div className="skeleton-shimmer h-px w-full mb-4 rounded" />
          <div className="skeleton-shimmer h-3 w-full mb-4 rounded" />
          <div className="flex gap-2">
            <div className="skeleton-shimmer h-8 flex-1 rounded-lg" />
            <div className="skeleton-shimmer h-8 flex-1 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
