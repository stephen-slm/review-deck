import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useVimStore } from "@/stores/vimStore";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  GitPullRequest,
  Eye,
  GitMerge,
  Clock,
  AlertTriangle,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { useMetrics, type AgeBucket } from "@/hooks/useMetrics";
import { timeAgo } from "@/lib/utils";

// ---- Chart colours (Tailwind-compatible palette for dark backgrounds) ----

const COLORS = {
  green: "#4ade80",
  red: "#f87171",
  yellow: "#facc15",
  blue: "#60a5fa",
  purple: "#c084fc",
  orange: "#fb923c",
  muted: "#71717a",
  cyan: "#22d3ee",
};

const PIE_PALETTE = [COLORS.green, COLORS.red, COLORS.yellow, COLORS.blue, COLORS.purple, COLORS.orange];

// ---- Formatting helpers ----

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---- Reusable small components ----

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h3>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: "12px",
    color: "hsl(var(--foreground))",
  },
  itemStyle: { color: "hsl(var(--foreground))" },
};

// ---- Page ----

export function MetricsPage() {
  const metrics = useMetrics();
  const navigate = useNavigate();

  // Register j/k as page scroll on this non-list page.
  useEffect(() => {
    const scrollEl = document.getElementById("scroll-region");
    useVimStore.getState().registerActions({
      onMoveDown: () => scrollEl?.scrollBy(0, 150),
      onMoveUp: () => scrollEl?.scrollBy(0, -150),
    });
    return () => useVimStore.getState().clearActions();
  }, []);

  const hasData = metrics.openPRs > 0 || metrics.merged14d > 0 || metrics.pendingReviews > 0;

  // Format review decisions for chart.
  const reviewDecisionData = useMemo(
    () =>
      metrics.reviewDecisions.map((d) => ({
        name: formatDecisionLabel(d.label),
        value: d.count,
      })),
    [metrics.reviewDecisions],
  );

  // Format CI health for chart.
  const ciHealthData = useMemo(
    () =>
      metrics.ciHealth.map((d) => ({
        name: formatCILabel(d.label),
        value: d.count,
      })),
    [metrics.ciHealth],
  );

  // Size distribution for bar chart.
  const sizeData = useMemo(
    () =>
      (["XS", "S", "M", "L", "XL"] as const).map((size) => ({
        size,
        count: metrics.sizeDistribution[size],
      })),
    [metrics.sizeDistribution],
  );

  // Review queue age for bar chart.
  const queueAgeData = useMemo(
    () =>
      (["<1d", "1-3d", "3-7d", "1-2w", "2w+"] as const).map((bucket: AgeBucket) => ({
        age: bucket,
        count: metrics.reviewQueueAge[bucket],
      })),
    [metrics.reviewQueueAge],
  );

  // Decisions given for donut chart.
  const decisionsGivenData = useMemo(
    () =>
      metrics.decisionsGiven.map((d) => ({
        name: formatDecisionLabel(d.state),
        value: d.count,
      })),
    [metrics.decisionsGiven],
  );

  // Trend data from historical snapshots.
  const trendOpenPRs = useMemo(
    () =>
      metrics.history.map((s) => ({
        time: new Date(s.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        date: new Date(s.recordedAt).toLocaleDateString(),
        value: s.openPRs,
      })),
    [metrics.history],
  );

  const trendPendingReviews = useMemo(
    () =>
      metrics.history.map((s) => ({
        time: new Date(s.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        date: new Date(s.recordedAt).toLocaleDateString(),
        value: s.pendingReviews + s.teamReviews,
      })),
    [metrics.history],
  );

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Metrics</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Trending metrics derived from your PR data. Updated each poll cycle.
        </p>
      </div>

      {!hasData && !metrics.historyLoading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-16">
          <TrendingUp className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No data yet. Metrics will appear after the first poll cycle completes.
          </p>
        </div>
      )}

      {(hasData || metrics.history.length > 0) && (
        <>
          {/* Row 1: Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              icon={<GitPullRequest className="h-5 w-5 text-blue-600 dark:text-blue-300" />}
              label="Open PRs"
              value={metrics.openPRs}
            />
            <MetricCard
              icon={<Eye className="h-5 w-5 text-amber-500 dark:text-amber-300" />}
              label="Pending Reviews"
              value={metrics.pendingReviews}
            />
            <MetricCard
              icon={<GitMerge className="h-5 w-5 text-green-600 dark:text-green-300" />}
              label="Merged (14d)"
              value={metrics.merged14d}
            />
            <MetricCard
              icon={<Clock className="h-5 w-5 text-purple-600 dark:text-purple-300" />}
              label="Avg Time to Merge"
              value={metrics.avgMergeHours > 0 ? fmtHours(metrics.avgMergeHours) : "--"}
            />
          </div>

          {/* Row 2: Merge velocity */}
          <section className="space-y-2">
            <SectionHeader title="Merge Velocity" />
            <ChartCard title="PRs merged per day (last 14 days)">
              {metrics.mergeVelocity.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={metrics.mergeVelocity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: COLORS.muted }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.muted }} width={30} />
                    <Tooltip {...tooltipStyle} labelFormatter={(v) => shortDate(String(v))} />
                    <Area type="monotone" dataKey="count" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.15} name="Merged" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>
          </section>

          {/* Row 3: Trend lines from historical snapshots */}
          {metrics.history.length > 0 && (
            <section className="space-y-2">
              <SectionHeader title="Trends (Historical)" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Open PRs over time">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={trendOpenPRs}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: COLORS.muted }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.muted }} width={30} />
                      <Tooltip {...tooltipStyle} />
                      <Line type="monotone" dataKey="value" stroke={COLORS.blue} dot={false} name="Open PRs" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Pending reviews over time">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={trendPendingReviews}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: COLORS.muted }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.muted }} width={30} />
                      <Tooltip {...tooltipStyle} />
                      <Line type="monotone" dataKey="value" stroke={COLORS.yellow} dot={false} name="Pending" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </section>
          )}

          {/* Row 4: PR breakdown — size, review decision, CI health */}
          <section className="space-y-2">
            <SectionHeader title="PR Breakdown" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ChartCard title="PR Size Distribution">
                {sizeData.some((d) => d.count > 0) ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={sizeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="size" tick={{ fontSize: 11, fill: COLORS.muted }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.muted }} width={30} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="count" fill={COLORS.blue} radius={[4, 4, 0, 0]} name="PRs" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </ChartCard>
              <ChartCard title="Review Decision">
                {reviewDecisionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={reviewDecisionData}
                        cx="50%" cy="50%"
                        innerRadius={40} outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {reviewDecisionData.map((_, i) => (
                          <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </ChartCard>
              <ChartCard title="CI Health">
                {ciHealthData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={ciHealthData}
                        cx="50%" cy="50%"
                        innerRadius={40} outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {ciHealthData.map((entry, i) => (
                          <Cell key={i} fill={ciColor(entry.name)} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </ChartCard>
            </div>
          </section>

          {/* Row 5: Review activity */}
          <section className="space-y-2">
            <SectionHeader title="Review Activity" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Review Queue Age">
                {queueAgeData.some((d) => d.count > 0) ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={queueAgeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="age" tick={{ fontSize: 11, fill: COLORS.muted }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.muted }} width={30} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="count" fill={COLORS.yellow} radius={[4, 4, 0, 0]} name="PRs" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No pending reviews" />
                )}
              </ChartCard>
              <ChartCard title="Your Review Decisions">
                {decisionsGivenData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={decisionsGivenData}
                        cx="50%" cy="50%"
                        innerRadius={40} outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {decisionsGivenData.map((_, i) => (
                          <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No reviews given yet" />
                )}
              </ChartCard>
            </div>
          </section>

          {/* Row 6: Repository distribution */}
          {metrics.repoBreakdown.length > 0 && (
            <section className="space-y-2">
              <SectionHeader title="Repository Distribution" />
              <ChartCard title="PRs by repository">
                <ResponsiveContainer width="100%" height={Math.max(150, metrics.repoBreakdown.length * 32)}>
                  <BarChart data={metrics.repoBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.muted }} />
                    <YAxis type="category" dataKey="repo" tick={{ fontSize: 11, fill: COLORS.muted }} width={180} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill={COLORS.purple} radius={[0, 4, 4, 0]} name="PRs" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>
          )}

          {/* Row 7: Attention needed */}
          {metrics.attention.length > 0 && (
            <section className="space-y-2">
              <SectionHeader title="Attention Needed" />
              <div className="rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2">PR</th>
                      <th className="px-4 py-2">Repo</th>
                      <th className="px-4 py-2">Issues</th>
                      <th className="px-4 py-2">Age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {metrics.attention.map((item) => (
                      <tr
                        key={item.pr.nodeId}
                        className="cursor-pointer transition-colors hover:bg-accent/50"
                        onClick={() => navigate(`/pr/${item.pr.nodeId}`)}
                      >
                        <td className="px-4 py-2 font-medium text-foreground">
                          <span className="truncate">{item.pr.title}</span>
                          <span className="ml-1.5 text-muted-foreground">#{item.pr.number}</span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {item.pr.repoOwner}/{item.pr.repoName}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.reasons.map((r) => (
                              <AttentionBadge key={r} reason={r} />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {timeAgo(item.pr.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {metrics.historyLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading historical data...</span>
        </div>
      )}
    </div>
  );
}

// ---- Helper components ----

function EmptyChart({ message = "No data" }: { message?: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function AttentionBadge({ reason }: { reason: string }) {
  const styles: Record<string, string> = {
    Conflicts: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
    "CI failure": "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
    "Changes requested": "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
    "Stale >7d": "bg-slate-200 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[reason] || "bg-slate-200 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200"}`}
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      {reason}
    </span>
  );
}

// ---- Label formatters ----

function formatDecisionLabel(raw: string): string {
  const map: Record<string, string> = {
    APPROVED: "Approved",
    CHANGES_REQUESTED: "Changes Requested",
    REVIEW_REQUIRED: "Review Required",
    COMMENTED: "Commented",
    DISMISSED: "Dismissed",
    PENDING: "Pending",
    NONE: "None",
  };
  return map[raw] || raw;
}

function formatCILabel(raw: string): string {
  const map: Record<string, string> = {
    SUCCESS: "Passing",
    FAILURE: "Failing",
    ERROR: "Error",
    PENDING: "Pending",
    NONE: "No checks",
  };
  return map[raw] || raw;
}

function ciColor(label: string): string {
  const map: Record<string, string> = {
    Passing: COLORS.green,
    Failing: COLORS.red,
    Error: COLORS.red,
    Pending: COLORS.yellow,
    "No checks": COLORS.muted,
  };
  return map[label] || COLORS.muted;
}
