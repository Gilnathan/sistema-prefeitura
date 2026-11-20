import type { EventoStatus } from "@/lib/types";
import { STATUS_CONFIG, cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: EventoStatus;
  className?: string;
}) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        cfg.badgeClass,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
      {cfg.label}
    </span>
  );
}
