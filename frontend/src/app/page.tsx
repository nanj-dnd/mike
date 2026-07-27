import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  ChevronRight,
  FileSearch,
  FolderKanban,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default function RootPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#f7f5ef] text-[#17232f]">
      <div className="relative isolate">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(circle_at_18%_18%,rgba(201,145,69,0.18),transparent_31%),radial-gradient(circle_at_84%_7%,rgba(23,53,75,0.12),transparent_28%)]" />
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            aria-label="Gavel home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17232f] text-[#f6d49a] shadow-lg shadow-[#17232f]/15">
              <Scale className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <span className="font-serif text-3xl leading-none tracking-tight">
              Gavel
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm font-medium">
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 text-[#334657] transition hover:bg-white/70 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/lawyering"
              className="inline-flex items-center gap-2 rounded-full bg-[#17232f] px-4 py-2.5 text-white shadow-lg shadow-[#17232f]/15 transition hover:-translate-y-0.5 hover:bg-[#243a4c]"
            >
              Enter Gavel <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </header>

        <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-32 lg:pt-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c99145]/30 bg-[#fffaf0]/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#8d5e25]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c99145]" />
              Purpose-built for Indian law firms
            </div>
            <h1 className="max-w-3xl font-serif text-5xl leading-[0.93] tracking-[-0.04em] text-[#17232f] sm:text-6xl lg:text-7xl">
              Make every matter move with more certainty.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#52616c] sm:text-xl">
              Gavel is the India-native workspace for legal research, document
              intelligence, drafting and matter work — designed around the way
              your firm practices.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/lawyering"
                className="inline-flex items-center gap-2 rounded-full bg-[#b8752c] px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-[#b8752c]/20 transition hover:-translate-y-0.5 hover:bg-[#9b5d1f]"
              >
                Start lawyering <ChevronRight className="h-4 w-4" />
              </Link>
              <a
                href="#what-you-can-do"
                className="inline-flex items-center gap-2 rounded-full border border-[#c9c5ba] bg-white/60 px-5 py-3 text-sm font-semibold text-[#263b4c] transition hover:border-[#8b9aa5] hover:bg-white"
              >
                See the workspace
              </a>
            </div>
            <p className="mt-5 text-sm text-[#73808a]">
              Bring your own AI provider. Your firm controls its model access.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[#e8ddc7] blur-2xl" />
            <div className="rounded-[2rem] border border-white/90 bg-[#fcfbf7] p-4 shadow-[0_30px_80px_rgba(23,35,47,0.16)] sm:p-5">
              <div className="rounded-[1.45rem] border border-[#e6e1d8] bg-white p-5 sm:p-7">
                <div className="flex items-center justify-between border-b border-[#ece8e0] pb-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#17232f] text-[#f4d290]">
                      <Scale className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Matter workspace</p>
                      <p className="text-xs text-[#79838a]">
                        India-first legal intelligence
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#edf4ee] px-3 py-1 text-xs font-medium text-[#397042]">
                    Private to your firm
                  </span>
                </div>
                <div className="mt-6 rounded-2xl border border-[#e6e1d8] bg-[#fbfaf7] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a6a31]">
                    Ask Gavel
                  </p>
                  <p className="mt-3 font-serif text-2xl leading-tight text-[#1f3140]">
                    Review this agreement for India-specific risk and
                    negotiation points.
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t border-[#e8e3d9] pt-4 text-xs text-[#68757d]">
                    <span>Commercial contract review</span>
                    <Sparkles className="h-4 w-4 text-[#b8752c]" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    ["Research", "Indian authorities"],
                    ["Draft", "Firm precedent"],
                    ["Organise", "Matter context"],
                  ].map(([title, detail]) => (
                    <div key={title} className="rounded-xl bg-[#f4f2ed] p-3">
                      <p className="text-xs font-semibold text-[#304655]">
                        {title}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-[#778187]">
                        {detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section
        id="what-you-can-do"
        className="border-y border-[#e2ddd2] bg-[#fffdf8]"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#a26a2b]">
              One legal workspace
            </p>
            <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">
              The work your team does every day, made more connected.
            </h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {[
              [
                BookOpenCheck,
                "Research with an India-first lens",
                "Ground research in Indian statutes, courts and drafting conventions — with foreign research kept distinct when you need it.",
              ],
              [
                FileSearch,
                "Understand every document faster",
                "Upload and interrogate documents, identify obligations and risks, and prepare review notes that stay tied to the matter.",
              ],
              [
                FolderKanban,
                "Keep matter context together",
                "Organise documents, conversations and work product by project so the next instruction starts with the right context.",
              ],
              [
                ShieldCheck,
                "Operate on your firm’s terms",
                "Each user connects their own supported AI provider key; model access stays under your firm’s control.",
              ],
            ].map(([Icon, title, detail]) => {
              const FeatureIcon = Icon as typeof BookOpenCheck;
              return (
                <article
                  key={title as string}
                  className="rounded-2xl border border-[#e4ded3] bg-[#fdfcf8] p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#4d4130]/5"
                >
                  <FeatureIcon
                    className="h-6 w-6 text-[#a4692a]"
                    strokeWidth={1.7}
                  />
                  <h3 className="mt-8 font-serif text-2xl text-[#203442]">
                    {title as string}
                  </h3>
                  <p className="mt-3 max-w-md leading-7 text-[#65717a]">
                    {detail as string}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="rounded-[2rem] bg-[#17232f] px-7 py-12 text-[#fbf8f0] sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#dfad68]">
              Ready when your matter is
            </p>
            <h2 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">
              A sharper way for Indian legal teams to get work done.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#cad0d3]">
              Open Gavel, connect your preferred AI provider, and begin with the
              matter in front of you.
            </p>
          </div>
          <Link
            href="/lawyering"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#f1c77e] px-5 py-3 text-sm font-semibold text-[#1d2b36] transition hover:-translate-y-0.5 hover:bg-[#f8d99e] lg:mt-0"
          >
            Enter Gavel <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#e2ddd2] px-6 py-8 text-sm text-[#6d777d]">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center lg:px-2">
          <span>
            © {new Date().getFullYear()} Gavel. Built for legal professionals in
            India.
          </span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-[#17232f]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[#17232f]">
              Terms
            </Link>
            <Link href="/support" className="hover:text-[#17232f]">
              Support
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
