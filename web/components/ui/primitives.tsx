import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Small Spool design-system pieces. Each mirrors a class in docs/design/modernist.css.

/** 12px uppercase red label above headings (".card-kicker" style). */
export function Kicker({ className, ...rest }: ComponentProps<"div">) {
  return <div {...rest} className={cn("text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-700", className)} />;
}

export type TagVariant = "accent" | "outline" | "neutral";
const tagVariants: Record<TagVariant, string> = {
  accent: "bg-accent-100 text-accent-800",
  outline: "border border-accent text-accent",
  neutral: "bg-neutral-100 text-neutral-800",
};

/** Small status label (".tag"). */
export function Tag({ variant = "neutral", className, ...rest }: ComponentProps<"span"> & { variant?: TagVariant }) {
  return (
    <span
      {...rest}
      className={cn("inline-flex items-center whitespace-nowrap px-2.5 py-[3px] text-[11px] tracking-[0.02em]", tagVariants[variant], className)}
    />
  );
}

/** Divider: 2px between sections (default), 1px between rows. */
export function Rule({ weight = 2, className }: { weight?: 1 | 2; className?: string }) {
  return <hr className={cn("m-0 border-0 bg-divider", weight === 2 ? "h-[2px]" : "h-px", className)} />;
}

/** Striped placeholder block for images that don't exist yet, and loading states. */
export function Skeleton({ label, tone = "light", className }: { label?: string; tone?: "light" | "dark"; className?: string }) {
  return (
    <div
      aria-hidden={!label}
      className={cn("flex items-end p-4", tone === "dark" ? "stripes-dark text-neutral-300" : "stripes text-neutral-800", className)}
    >
      {label && <span className="text-[11px] uppercase tracking-[0.1em]">{label}</span>}
    </div>
  );
}

/** Label + control + optional hint/error (".field"). */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={htmlFor} className="mb-[5px] block text-[12px] text-text/70">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-2 text-[13px] text-neutral-700">{hint}</p>}
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-accent-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Segmented radio group (".seg"). Arrow-key navigation comes from the native radios. */
export function Seg<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex self-start overflow-hidden border border-divider">
      {options.map((opt, i) => {
        const checked = opt.value === value;
        return (
          <label
            key={opt.value}
            className={cn(
              "inline-flex cursor-pointer items-center whitespace-nowrap",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent",
              size === "md" ? "px-4 py-2.5 text-[14px]" : "px-3 py-[7px] text-[13px]",
              i > 0 && "border-l border-divider",
              checked ? "bg-accent text-bg" : "hover-ink",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

type InputProps = Omit<ComponentProps<"input">, "size"> & { size?: "md" | "lg"; mono?: boolean };

/** Text input (".input"). */
export function Input({ size = "md", mono, className, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={cn(
        "block w-full border border-divider bg-surface px-2.5 py-1.5 text-text caret-accent hover:border-text/45",
        "focus-visible:border-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45",
        size === "lg" ? "min-h-11 text-[16px]" : "min-h-9 text-[14px]",
        mono && "font-mono",
        className,
      )}
    />
  );
}
