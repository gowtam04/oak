import { parseUsageAttribution } from "./usage-format";

/** Source domain + legal caption under the usage table / species lists. */
export default function UsageSourceNote({
  attribution,
}: {
  attribution: string;
}) {
  const trimmed = attribution.trim();
  if (!trimmed) return null;
  const parts = parseUsageAttribution(trimmed);
  return (
    <p className="ref-meta-source" data-testid="usage-source">
      <span className="ref-meta-source__label">Source</span>
      <span className="ref-meta-source__name">{parts.source}</span>
      {parts.legal ? (
        <span className="ref-meta-source__legal">{parts.legal}</span>
      ) : null}
    </p>
  );
}
