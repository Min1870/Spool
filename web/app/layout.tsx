import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

// next/font downloads Archivo at build time and serves it from our own site.
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "600", "800"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: { default: "Spool — video hosting for creators", template: "%s · Spool" },
  description: "Upload once. Be watched everywhere.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
