import type { AnalysisDetail } from '@marxmatrix/contracts';

export function ResultChart({ analysis }: { analysis: AnalysisDetail }) {
  const latest = analysis.calculationVersions.at(-1);
  if (latest === undefined) return null;
  const values = [
    ['c', latest.result.constantCapital],
    ['v', latest.result.variableCapital],
    ['m', latest.result.surplusValue]
  ] as const;
  const max = Math.max(...values.map(([, value]) => Math.abs(value)), 1);
  return (
    <figure className="scanner-chart">
      <figcaption>So sánh cấu phần giá trị của phiên bản {latest.version}</figcaption>
      <div className="bar-list">
        {values.map(([label, value]) => (
          <div key={label}>
            <span>
              {label}: {value.toLocaleString('vi-VN')}
            </span>
            <i style={{ width: `${(Math.abs(value) / max) * 100}%` }} />
          </div>
        ))}
      </div>
    </figure>
  );
}
