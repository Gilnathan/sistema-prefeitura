export default function PortalLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-64 rounded-lg bg-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-muted/70" />
        </div>
        <div className="h-10 w-36 rounded-md bg-muted" />
      </div>

      <div className="h-24 w-full rounded-xl border bg-card/70" />

      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 w-full rounded-xl border bg-card/70 p-4 space-y-2.5"
          >
            <div className="flex gap-2">
              <div className="h-5 w-16 rounded-full bg-muted" />
              <div className="h-5 w-24 rounded-md bg-muted" />
              <div className="h-5 w-20 rounded bg-muted/70" />
            </div>
            <div className="h-5 w-3/4 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
