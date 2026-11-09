import { cn } from "@/lib/utils";
import { ANALYSIS_LABEL, CRITERION_STATUS_LABEL, INTERVIEW_LABEL, RECOMMENDATION_LABEL, type CriterionStatus } from "@/lib/recruitment";

const tone = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-destructive",
  primary: "bg-primary-soft text-primary",
} as const;

export function Pill({ t = "neutral", children, className }: { t?: keyof typeof tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tone[t], className)}>{children}</span>;
}

export function AnalysisPill({ status }: { status: string }) {
  const t = status === "done" ? "success" : status === "error" ? "danger" : status === "pending" ? "neutral" : "info";
  return <Pill t={t}>{ANALYSIS_LABEL[status] ?? status}</Pill>;
}

export function InterviewPill({ status }: { status: string | undefined }) {
  const s = status ?? "none";
  const t = s === "completed" ? "success" : s === "in_progress" ? "info" : s === "not_started" ? "warning" : "neutral";
  return <Pill t={t}>{INTERVIEW_LABEL[s]}</Pill>;
}

export function RecommendationPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const t = value === "invite_interview" ? "primary" : value === "verify" ? "warning" : "info";
  return <Pill t={t}>{RECOMMENDATION_LABEL[value] ?? value}</Pill>;
}

export function CriterionPill({ status }: { status: CriterionStatus }) {
  const t = status === "documented" ? "success" : status === "partial" ? "info" : status === "contradictory" ? "danger" : status === "to_verify" ? "warning" : "neutral";
  return <Pill t={t}>{CRITERION_STATUS_LABEL[status]}</Pill>;
}

export function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums">{score} %</span>
    </div>
  );
}
