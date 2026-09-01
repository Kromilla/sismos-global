import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-ink-800 bg-ink-900/70 p-4 shadow-lg shadow-black/20 ${className}`}
    >
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h3 className="text-sm font-semibold tracking-wide text-slate-100">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
            )}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-xl leading-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] leading-snug text-slate-500">
          {hint}
        </div>
      )}
    </div>
  );
}

export function Badge({
  children,
  color = "#334155",
  title,
}: {
  children: ReactNode;
  color?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-950"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}

export function Note({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  const styles =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/5 text-amber-200/90"
      : "border-ink-700 bg-ink-900/60 text-slate-400";
  return (
    <p
      className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${styles}`}
    >
      {children}
    </p>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-700 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "rounded-lg border border-ink-700 bg-ink-950/80 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30";

export const buttonClass =
  "rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-500/50 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40";
