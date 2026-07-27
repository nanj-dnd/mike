import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  FileSearch,
  FolderKanban,
  Scale,
  ShieldCheck,
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
            <a
              href="tel:+918104610781"
              className="inline-flex items-center gap-2 rounded-full bg-[#17232f] px-4 py-2.5 text-white shadow-lg shadow-[#17232f]/15 transition hover:-translate-y-0.5 hover:bg-[#243a4c]"
            >
              Contact us <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </nav>
        </header>

        <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-32 lg:pt-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c99145]/30 bg-[#fffaf0]/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#8d5e25]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c99145]" />
              Purpose-built for Indian law firms
            </div>
            <h1 className="max-w-3xl font-serif text-5xl leading-[0.93] tracking-[-0.04em] text-[#17232f] sm:text-6xl lg:text-7xl">
              Everything your firm needs to do legal work better.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#52616c] sm:text-xl">
              Gavel is an AI legal work platform for Indian law firms: document
              intelligence, drafting playbooks, case-law research, firm
              knowledge, and the controls a serious practice needs.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="tel:+918104610781"
                className="inline-flex items-center gap-2 rounded-full bg-[#b8752c] px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-[#b8752c]/20 transition hover:-translate-y-0.5 hover:bg-[#9b5d1f]"
              >
                Contact us: +91 81046 10781 <ArrowUpRight className="h-4 w-4" />
              </a>
              <a
                href="#what-you-can-do"
                className="inline-flex items-center gap-2 rounded-full border border-[#c9c5ba] bg-white/60 px-5 py-3 text-sm font-semibold text-[#263b4c] transition hover:border-[#8b9aa5] hover:bg-white"
              >
                Explore capabilities
              </a>
            </div>
            <p className="mt-5 text-sm text-[#73808a]">
              Speak to us on +91 81046 10781 or +91 91371 71665.
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
                      <p className="text-sm font-semibold">Gavel capabilities</p>
                      <p className="text-xs text-[#79838a]">
                        AI legal work platform, built India-first
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#edf4ee] px-3 py-1 text-xs font-medium text-[#397042]">
                    Prepared for law firms
                  </span>
                </div>
                <div className="mt-6 grid grid-cols-2 border-l border-t border-[#e6e1d8]">
                  {[
                    ["14", "capability areas"],
                    ["90+", "individual features"],
                    ["27", "built-in drafting & review playbooks"],
                    ["0", "markup on your AI model costs"],
                  ].map(([number, label]) => (
                    <div key={label} className="border-b border-r border-[#e6e1d8] p-4 sm:p-5">
                      <p className="font-serif text-4xl text-[#8d2533] sm:text-5xl">{number}</p>
                      <p className="mt-2 text-xs leading-5 text-[#68757d]">{label}</p>
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
              Built for the whole firm
            </p>
            <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">
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
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#f1c77e] px-5 py-3 text-sm font-semibold text-[#1d2b36] transition hover:-translate-y-0.5 hover:bg-[#f8d99e] lg:mt-0"
          >
            Contact us: +91 91371 71665 <ArrowUpRight className="h-4 w-4" />
          </a>
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
