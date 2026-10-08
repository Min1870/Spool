"use client";

import { ArrowUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "./ui";

export function Nav() {
  const pathname = usePathname();
  const onVideos = pathname.startsWith("/videos") || pathname.startsWith("/watch");
  return (
    <nav className="flex flex-wrap items-center gap-4 border-b-2 border-divider px-[clamp(16px,4vw,40px)] py-4">
      <Link href="/" className="mr-auto flex items-center gap-2 text-[20px] font-extrabold text-text no-underline hover:text-text">
        <span className="block size-3.5 bg-accent" />
        Spool
      </Link>
      <Link
        href="/videos"
        aria-current={onVideos ? "page" : undefined}
        className="text-[14px] text-text no-underline hover:text-accent aria-[current=page]:text-accent"
      >
        My videos
      </Link>
      <Button href="/upload" variant="primary" className="gap-2">
        <ArrowUp size={16} strokeWidth={2.5} strokeLinecap="square" />
        Upload
      </Button>
    </nav>
  );
}
