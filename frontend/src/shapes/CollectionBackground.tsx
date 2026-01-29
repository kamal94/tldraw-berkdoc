export function CollectionBackground({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  return (
    <div
      className="rounded-xl bg-blue-200 shadow-xl ring-1 ring-blue-300/60"
      style={{ width, height }}
    />
  );
}
