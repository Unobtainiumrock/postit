/**
 * Responsive card grid. Previously used CSS multi-column layout, but that
 * interacts badly with children that create their own compositing layers
 * (our `.liquid-glass` uses `backdrop-filter`) — in Chromium / Safari newer
 * items can paint underneath earlier ones in the same column and appear to
 * "replace" previous posts. Plain CSS Grid with `items-start` is boring
 * but rock-solid: every child gets its own row/col cell.
 *
 * Children are rendered as-is so their own `key` props drive React
 * reconciliation directly — no wrapper div, no `Children.map` rewrite.
 */
export default function MasonryGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
      {children}
    </div>
  );
}
