import type { ReactNode } from "react";
import { Nav } from "./Nav";

/** Nav + content column + footer, around every page. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-[clamp(16px,4vw,40px)]">{children}</main>
      <footer className="flex flex-wrap justify-between gap-4 border-t-2 border-divider px-[clamp(16px,4vw,40px)] py-4 text-[13px] text-neutral-700">
        <span>Spool — video hosting for creators</span>
        <span>Help · Terms · Privacy</span>
      </footer>
    </div>
  );
}
