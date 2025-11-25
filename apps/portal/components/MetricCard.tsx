import { Card } from "@nova/design-system";

export interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  helper?: string;
  trend?: "up" | "down";
}

export function MetricCard({ label, value, delta, helper, trend = "up" }: MetricCardProps) {
  const deltaClassName =
    trend === "down"
      ? "metric-card__delta metric-card__delta--negative"
      : "metric-card__delta metric-card__delta--positive";

  return (
    <Card>
      <div className="metric-card__value">{value}</div>
      <p className="metric-card__label">{label}</p>
      {delta ? <div className={deltaClassName}>{delta}</div> : null}
      {helper ? <p className="metric-card__helper">{helper}</p> : null}
    </Card>
  );
}
