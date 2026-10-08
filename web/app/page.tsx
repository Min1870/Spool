import { Button, Kicker, Skeleton } from "@/components/ui";

// Landing page, from the Spool design (docs/design/README.md, screen 1). Step copy is
// adapted to what this app actually does (no scheduling; HLS at 480p/720p).
const steps = [
  { n: "01", title: "Drop your file", body: "MP4, MOV or WebM. Uploads go straight to storage and resume if your connection blinks." },
  { n: "02", title: "We transcode it", body: "A background worker turns it into adaptive HLS at 480p and 720p, plus a thumbnail." },
  { n: "03", title: "Watch anywhere", body: "A clean link that streams at the right quality on any screen, and embeds on other sites." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] border-b-2 border-divider">
        <div className="flex flex-col gap-6 py-[clamp(32px,6vw,72px)] pr-8">
          <Kicker>For creators</Kicker>
          <h1 className="text-[clamp(48px,7vw,96px)] leading-[0.95] tracking-[-0.035em] text-balance">Upload once. Be watched everywhere.</h1>
          <p className="max-w-[460px] text-[18px] text-pretty">
            Drop in your cut and Spool turns it into a stream that plays on anything.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="/upload" variant="primary" size="lg" spread className="min-w-[220px]">
              Upload a video <span aria-hidden>→</span>
            </Button>
            <Button href="/videos" variant="secondary" size="lg">
              Watch an example
            </Button>
          </div>
        </div>
        <Skeleton label="Hero still — B/W creator at work" className="min-h-[360px] border-l-2 border-divider" />
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] border-b-2 border-divider">
        {steps.map((s) => (
          <div key={s.n} className="mr-6 flex flex-col gap-3 border-r-2 border-divider py-8 pr-6">
            <div className="text-[44px] leading-none font-extrabold text-accent">{s.n}</div>
            <h4>{s.title}</h4>
            <p className="max-w-[320px] text-[15px]">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="my-8 flex flex-col items-start gap-6 bg-accent px-8 py-[clamp(32px,5vw,64px)] text-bg">
        <h2 className="max-w-[800px] text-[clamp(36px,5vw,64px)] leading-none tracking-[-0.03em]">Your next upload is one drag away.</h2>
        <Button href="/upload" variant="inverse" size="lg" spread className="min-w-[220px]">
          Start uploading <span aria-hidden>→</span>
        </Button>
      </section>
    </div>
  );
}
