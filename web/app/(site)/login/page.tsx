import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { currentUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next: rawNext, error } = await searchParams;
  const next = rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/upload";

  // Already signed in? Skip the form.
  if (await currentUser()) redirect(next);

  return (
    <div className="flex flex-col gap-6 py-[clamp(32px,5vw,56px)]">
      <PageHeader kicker="Account" title="Sign in to upload">
        <p className="max-w-[520px] text-[16px]">Anyone can watch. You need an account to upload videos.</p>
      </PageHeader>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-accent-700">
          That link didn&apos;t work (it may have expired). Sign in, or create your account again.
        </p>
      )}
      <LoginForm next={next} />
    </div>
  );
}
