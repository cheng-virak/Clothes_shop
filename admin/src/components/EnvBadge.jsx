const STYLES = {
  LOCAL: 'bg-stone-200 text-stone-700',
  STAGING: 'bg-amber-200 text-amber-900',
  PRODUCTION: 'bg-red-200 text-red-900',
};

/**
 * Visible in the header at all times — so nobody edits real data while
 * thinking they're on a local sandbox, or vice versa. Driven by
 * VITE_ENV_LABEL, set per-deployment in that environment's .env (never
 * inferred from the URL, which is easy to misjudge on a staging domain
 * that looks production-ish).
 */
export default function EnvBadge() {
  const label = import.meta.env.VITE_ENV_LABEL || 'LOCAL';
  const style = STYLES[label] || STYLES.LOCAL;

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}
