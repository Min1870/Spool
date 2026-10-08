import type { ReactNode } from "react";
import { Kicker } from "./ui";

/** Kicker + h1 header with a 2px bottom rule, used at the top of app screens. */
export function PageHeader({ kicker, title, children, actions }: { kicker: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-divider pb-6">
      <div className="flex flex-col gap-2">
        <Kicker>{kicker}</Kicker>
        <h1 className="text-[clamp(36px,5vw,56px)] tracking-[-0.03em]">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}
