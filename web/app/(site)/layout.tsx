import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";

// Every normal Spool page gets the nav + footer. The folder name in brackets, (site),
// is a "route group": it groups pages under a shared layout without adding to the URL
// (app/(site)/upload/page.tsx is still /upload). /embed lives outside it, so embedded
// players have no Spool chrome around them.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
