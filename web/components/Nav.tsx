"use client";

import { ArrowUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Button } from "./ui";

export function Nav({ signedIn, email }: { signedIn: boolean; email: string | null }) {
  const pathname = usePathname();
  const onVideos = pathname.startsWith("/videos") || pathname.startsWith("/watch");
  const linkCls = "text-[14px] text-text no-underline hover:text-accent aria-[current=page]:text-accent";

  return (
    <nav className="flex flex-wrap items-center gap-4 border-b-2 border-divider px-[clamp(16px,4vw,40px)] py-4">
      <Link href="/" className="mr-auto flex items-center gap-2 text-[20px] font-extrabold text-text no-underline hover:text-text">
        <span className="block size-3.5 bg-accent" />
        Spool
      </Link>

      {signedIn && (
        <Link href="/videos" aria-current={onVideos ? "page" : undefined} className={linkCls}>
          My videos
        </Link>
      )}

      {signedIn ? (
        // A <form> that calls the signOut server action: works even before JavaScript loads.
        <form action={signOut} className="flex items-center gap-2">
          {email && <span className="hidden max-w-[200px] truncate font-mono text-[12px] text-neutral-700 sm:inline">{email}</span>}
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      ) : (
        <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined} className={linkCls}>
          Sign in
        </Link>
      )}

      <Button href="/upload" variant="primary" className="gap-2">
        <ArrowUp size={16} strokeWidth={2.5} strokeLinecap="square" />
        Upload
      </Button>
    </nav>
  );
}
