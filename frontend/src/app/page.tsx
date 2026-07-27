import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  FileSearch,
  FolderKanban,
  ShieldCheck,
} from "lucide-react";

export default function RootPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#f5f0e8] font-serif text-[#1f1d1b]">
      <div className="relative isolate">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[48rem] bg-[radial-gradient(circle_at_16%_12%,rgba(139,39,55,0.12),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(211,194,164,0.38),transparent_31%),linear-gradient(135deg,#f8f4ed_0%,#f1e9dc_100%)]" />
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
          <Link href="/" className="font-serif text-4xl leading-none tracking-tight text-[#1f1d1b]" aria-label="Gavel home">
            Gavel<span className="text-[#8b2737]">.</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm font-medium">
            <a
              href="tel:+918104610781"
              className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/45 px-4 py-2.5 text-[#6f1f2e] shadow-[7px_7px_16px_rgba(121,101,73,0.12),-6px_-6px_14px_rgba(255,255,255,0.7)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/65"
            >
              Contact us <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </nav>
        </header>

        <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-32 lg:pt-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#7d2634] shadow-[5px_5px_13px_rgba(121,101,73,0.09),-5px_-5px_12px_rgba(255,255,255,0.65)] backdrop-blur-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8b2737]" />
              Purpose-built for Indian law firms
            </div>
            <h1 className="max-w-3xl font-serif text-5xl leading-[0.93] tracking-[-0.04em] text-[#1f1d1b] sm:text-6xl lg:text-7xl">
              Everything your firm needs to do legal work better.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#665e56] sm:text-xl">
              Gavel is an AI legal work platform for Indian law firms: document
              intelligence, drafting playbooks, case-law research, firm
              knowledge, and the controls a serious practice needs.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="tel:+918104610781"
                className="inline-flex items-center gap-2 rounded-full bg-[#852737] px-5 py-3 text-sm font-semibold text-white shadow-[7px_7px_15px_rgba(102,28,40,0.22),-5px_-5px_12px_rgba(255,255,255,0.45)] transition hover:-translate-y-0.5 hover:bg-[#6f1f2e]"
              >
                Contact us: +91 81046 10781 <ArrowUpRight className="h-4 w-4" />
              </a>
              <a
                href="#what-you-can-do"
                className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/36 px-5 py-3 text-sm font-semibold text-[#5e2a32] shadow-[6px_6px_14px_rgba(121,101,73,0.1),-5px_-5px_12px_rgba(255,255,255,0.65)] backdrop-blur-lg transition hover:-translate-y-0.5 hover:bg-white/60"
              >
                Explore capabilities
              </a>
            </div>
            <p className="mt-5 text-sm text-[#746a61]">
              Speak to us on +91 81046 10781 or +91 91371 71665.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-[#d9c6a6]/65 blur-2xl" />
            <div className="rounded-[1.7rem] border border-white/75 bg-white/38 p-4 shadow-[16px_18px_38px_rgba(116,91,58,0.16),-11px_-11px_26px_rgba(255,255,255,0.68)] backdrop-blur-2xl sm:p-5">
              <div className="rounded-[1.15rem] border border-white/70 bg-[#f8f4ed]/72 p-5 shadow-[inset_1px_1px_0_rgba(255,255,255,0.82),inset_-4px_-4px_10px_rgba(152,126,91,0.07)] sm:p-7">
                <div className="flex items-center justify-between border-b border-[#ded3c4] pb-5">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-serif text-2xl leading-none text-[#1f1d1b]">Gavel<span className="text-[#8b2737]">.</span></p>
                      <p className="mt-1 text-xs text-[#746a61]">
                        AI legal work platform, built India-first
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-white/75 bg-white/50 px-3 py-1 text-xs font-medium text-[#7a2836] shadow-[3px_3px_7px_rgba(121,101,73,0.1),-3px_-3px_7px_rgba(255,255,255,0.7)]">
                    Prepared for law firms
                  </span>
                </div>
                <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-white/70 bg-white/30 shadow-[inset_3px_3px_8px_rgba(133,107,73,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.65)]">
                  {[
                    ["14", "capability areas"],
                    ["90+", "individual features"],
                    ["27", "built-in drafting & review playbooks"],
                    ["0", "markup on your AI model costs"],
                  ].map(([number, label]) => (
                    <div key={label} className="border-b border-r border-white/65 p-4 last:border-b-0 sm:p-5">
                      <p className="font-serif text-4xl text-[#852737] sm:text-5xl">{number}</p>
                      <p className="mt-2 text-xs leading-5 text-[#746a61]">{label}</p>
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
        className="border-y border-white/70 bg-[#faf7f1]"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#a26a2b]">
              Gavel capabilities
            </p>
            <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.03em] text-[#1f1d1b] sm:text-5xl">
              Fourteen capability areas, from the first document to firm-wide controls.
            </h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {[
              [
                BookOpenCheck,
                "Document intelligence & review at scale",
                "Matter-centric workspaces, grounded answers with citations, version history, and spreadsheet-style extraction across hundreds of documents.",
              ],
              [
                FileSearch,
                "India-specific drafting & research",
                "Court-drafting templates, contract-review playbooks, Indian Kanoon research by default, and optional foreign research when the firm chooses it.",
              ],
              [
                FolderKanban,
                "Firm knowledge & conflict checking",
                "A private clause library, meaning-based firm-wide document search, and recorded conflict checks that recognise Indian naming conventions.",
              ],
              [
                ShieldCheck,
                "Security, compliance & integrations",
                "Role-based access, audit trails, MFA, SSO, encrypted credentials, data export and deletion, plus cloud import and remote-tool connections.",
              ],
            ].map(([Icon, title, detail]) => {
              const FeatureIcon = Icon as typeof BookOpenCheck;
              return (
                <article
                  key={title as string}
                  className="rounded-2xl border border-white/75 bg-white/42 p-6 shadow-[8px_8px_18px_rgba(121,101,73,0.1),-7px_-7px_16px_rgba(255,255,255,0.68),inset_1px_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition hover:-translate-y-1 hover:bg-white/60"
                >
                  <FeatureIcon
                    className="h-6 w-6 text-[#852737]"
                    strokeWidth={1.7}
                  />
                  <h3 className="mt-8 font-serif text-2xl text-[#352124]">
                    {title as string}
                  </h3>
                  <p className="mt-3 max-w-md leading-7 text-[#6b6259]">
                    {detail as string}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="rounded-[1.75rem] border border-[#a5525d]/45 bg-[#852737] px-7 py-12 text-[#fffaf1] shadow-[15px_16px_32px_rgba(91,29,40,0.2),-8px_-8px_18px_rgba(255,255,255,0.46),inset_1px_1px_0_rgba(255,255,255,0.15)] sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#dfad68]">
              See what Gavel can do for your firm
            </p>
            <h2 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">
              Speak to the team about Gavel’s capabilities.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#cad0d3]">
              From drafting and review to research, knowledge and security, we will walk you through the areas most relevant to your practice.
            </p>
          </div>
          <a
            href="tel:+919137171665"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/88 px-5 py-3 text-sm font-semibold text-[#702232] shadow-[6px_6px_13px_rgba(67,20,29,0.2),-5px_-5px_10px_rgba(255,255,255,0.12)] transition hover:-translate-y-0.5 hover:bg-white lg:mt-0"
          >
            Contact us: +91 91371 71665 <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <footer className="border-t border-white/70 bg-[#f5f0e8] px-6 py-8 text-sm text-[#746a61]">
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
