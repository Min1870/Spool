import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "inverse";
type Size = "md" | "lg";

// No tailwind-merge here: conflicting utilities (justify-*, border colour, padding)
// must never both be emitted, so each one is chosen exactly once below.
const base =
  "inline-flex items-center gap-1.5 whitespace-nowrap border font-extrabold no-underline " +
  "disabled:cursor-not-allowed disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "border-transparent bg-accent text-bg hover:bg-accent-600 hover:text-bg active:bg-accent-700 disabled:hover:bg-accent",
  secondary: "border-divider text-text hover:text-text hover-ink",
  ghost: "border-transparent text-accent hover:text-accent hover-accent",
  inverse: "border-transparent bg-bg text-text hover:text-text hover:bg-neutral-100",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  /** Push the last child (e.g. an arrow) to the far right, as in the landing CTAs. */
  spread?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonProps = CommonProps & Omit<ComponentProps<"button">, keyof CommonProps> & { href?: undefined };
type LinkProps = CommonProps & Omit<ComponentProps<typeof Link>, keyof CommonProps> & { href: string };

export function buttonClass({ variant = "secondary", size = "md", spread, className }: Omit<CommonProps, "children">) {
  const sizing =
    size === "lg" ? "p-4 text-[16px] leading-[1.2]" : cn("py-2 text-[14px] leading-[1.2]", variant === "ghost" ? "px-1" : "px-[14.4px]");
  return cn(base, variants[variant], sizing, spread ? "justify-between" : "justify-start", className);
}

export function Button(props: ButtonProps | LinkProps) {
  const { variant, size, spread, className, children, ...rest } = props;
  const cls = buttonClass({ variant, size, spread, className });
  if (typeof rest.href === "string") {
    return (
      <Link {...(rest as Omit<LinkProps, keyof CommonProps>)} className={cls}>
        {children}
      </Link>
    );
  }
  const { type = "button", ...buttonRest } = rest as Omit<ButtonProps, keyof CommonProps>;
  return (
    <button type={type} {...buttonRest} className={cls}>
      {children}
    </button>
  );
}
