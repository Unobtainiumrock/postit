import { Children, isValidElement } from "react";

/**
 * CSS-columns masonry — zero JS, zero resize observers. Items flow into columns
 * by height. Each child is wrapped with break-inside-avoid so cards don't split
 * mid-render across columns.
 */
export default function MasonryGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4">
      {Children.map(children, (child, i) => {
        const key =
          isValidElement(child) && child.key != null ? String(child.key) : `masonry-${i}`;
        return (
          <div key={key} className="break-inside-avoid mb-4">
            {child}
          </div>
        );
      })}
    </div>
  );
}
