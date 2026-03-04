import { timeAgo } from "@/lib/utils";

export function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

export function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

export function TimestampRow({
  icon,
  label,
  date,
}: {
  icon: React.ReactNode;
  label: string;
  date: string | Date;
}) {
  const d = new Date(date);
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      <span>{label}:</span>
      <span className="ml-auto text-foreground" title={d.toLocaleString()}>
        {timeAgo(date)}
      </span>
    </div>
  );
}
