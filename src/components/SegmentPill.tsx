/**
 * The white pill behind the selected option of a segmented control. It slides
 * over to whichever option is selected. The control needs `relative p-1 gap-1`
 * and `count` equal columns; options sit on top with `relative`.
 */
export function SegmentPill({ index, count }: { index: number; count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute top-1 bottom-1 left-1 rounded-full bg-ink transition-[translate] duration-300 ease-out-soft"
      style={{
        width: `calc((100% - 0.5rem - ${count - 1} * 0.25rem) / ${count})`,
        translate: `calc(${index} * (100% + 0.25rem)) 0`,
      }}
    />
  )
}
