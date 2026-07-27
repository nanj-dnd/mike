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
              className="inline-flex items-center gap-2 rounded-md border border-[#8b2737]/35 bg-[#f9f4eb] px-4 py-2.5 text-[#6f1f2e] transition hover:bg-[#fffaf3]"
            >
              Contact us <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </nav>
        </header>

        <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-32 lg:pt-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 border-b border-[#8b2737]/45 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7d2634]">
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
                className="inline-flex items-center gap-2 rounded-md bg-[#852737] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6f1f2e]"
              >
                Contact us: +91 81046 10781 <ArrowUpRight className="h-4 w-4" />
              </a>
              <a
                href="#what-you-can-do"
                className="inline-flex items-center gap-2 rounded-md border border-[#a99176] bg-transparent px-5 py-3 text-sm font-semibold text-[#5e2a32] transition hover:bg-[#fffaf3]"
              >
                Explore capabilities
              </a>
            </div>
            <p className="mt-5 text-sm text-[#746a61]">
              Speak to us on +91 81046 10781 or +91 91371 71665.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="absolute -inset-3 -z-10 bg-[#e4d7c4]" />
            <div className="border border-[#d8cdbd] bg-[#fbf8f1] p-4 sm:p-5">
              <div className="border border-[#ded3c4] bg-[#f8f4ed] p-5 sm:p-7">
                <div className="flex items-center justify-between border-b border-[#ded3c4] pb-5">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-serif text-2xl leading-none text-[#1f1d1b]">Gavel<span className="text-[#8b2737]">.</span></p>
                      <p className="mt-1 text-xs text-[#746a61]">
                        AI legal work platform, built India-first
                      </p>
                    </div>
                  </div>
                  <span className="border border-[#b78d93] bg-[#f9efef] px-3 py-1 text-xs font-medium text-[#7a2836]">
                    Prepared for law firms
                  </span>
                </div>
                <div className="mt-6 grid grid-cols-2 overflow-hidden border border-[#ded3c4] bg-[#fbf8f1]">
                  {[
                    ["14", "capability areas"],
                    ["90+", "individual features"],
                    ["27", "built-in drafting & review playbooks"],
                    ["0", "markup on your AI model costs"],
                  ].map(([number, label]) => (
                    <div key={label} className="border-b border-r border-[#ded3c4] p-4 last:border-b-0 sm:p-5">
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
                  className="border border-[#ded3c4] bg-[#fbf8f1] p-6 transition hover:border-[#a57a81] hover:bg-[#fffaf3]"
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
        <div className="border border-[#6f1f2e] bg-[#852737] px-7 py-12 text-[#fffaf1] sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between">
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
            className="mt-8 inline-flex items-center gap-2 rounded-md border border-white/70 bg-[#fffaf3] px-5 py-3 text-sm font-semibold text-[#702232] transition hover:bg-white lg:mt-0"
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
