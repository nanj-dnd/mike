import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  FileSearch,
  FolderKanban,
  ShieldCheck,
} from "lucide-react";

const capabilityCatalogue = [
  {
    title: "AI legal assistant",
    items: [
      "Grounded answers drawn from documents uploaded to the matter.",
      "Inline citations linked to the source page, quote, or spreadsheet cell.",
      "Creation and editing of Word, Excel, and PowerPoint files in the conversation.",
      "Track-changes proposals that lawyers can accept or reject.",
      "Version history for every document the assistant touches.",
      "Claude, Gemini, or GPT selected per message.",
      "Clarifying questions before the assistant makes an assumption.",
      "Standalone or matter-scoped conversations.",
    ],
  },
  {
    title: "Document workspace",
    items: [
      "Matter-centric documents, folders, chats, and reviews.",
      "In-browser viewing for PDFs, Word documents, and Excel files.",
      "Nested folders for matter organisation.",
      "Version history and rollback for documents.",
      "Owner-controlled sharing by email and bulk ZIP export.",
    ],
  },
  {
    title: "Tabular review",
    items: [
      "The same questions applied across every document in a matter.",
      "Custom extraction columns defined by the reviewing lawyer.",
      "Colour-coded risk flags and resumable review runs.",
      "Formatted Excel export and follow-up chat scoped to the review table.",
      "Pre-built extraction sets or a blank starting point.",
    ],
  },
  {
    title: "Legal workflows & playbooks",
    items: [
      "Court drafting for Section 138 NI Act notices, BNSS bail applications, and Article 226 writ petitions.",
      "Contract review for NDAs, leases, credit agreements, SPAs, shareholder agreements, supply and employment agreements, guarantees, and LPAs.",
      "Diligence reviews for risk, anomalies, key dates, change of control, and e-discovery.",
      "Research memo and case chronology tools.",
      "Deviation analysis against a firm standard form.",
      "Custom workflows with view or edit sharing controls.",
    ],
  },
  {
    title: "Case-law research",
    items: [
      "Indian Kanoon research available by default.",
      "Optional CourtListener research and citation verification for US work.",
      "Opinions opened beside the draft, with the cited passage highlighted.",
    ],
  },
  {
    title: "Clause library & firm search",
    items: [
      "A private bank of negotiated and approved firm language.",
      "Drafting guidance, fallback positions, and non-negotiables attached to clauses.",
      "Meaning-based search across uploaded documents, not only keywords.",
      "Firm-wide reach-back across the wider document library.",
    ],
  },
  {
    title: "Conflict & team management",
    items: [
      "Matter party registers with client, opposing, and other-side roles.",
      "Deterministic matching that explains why names match.",
      "Indian naming convention matching, including M/s and firm-name variants.",
      "Adverse-versus-related severity and firm-wide conflict scope.",
      "Recorded checks, firm roles, email invitations, audit logs, and individual user preferences.",
    ],
  },
  {
    title: "Security, data & models",
    items: [
      "Role-based access for Admin, Partner, and Associate roles.",
      "MFA, firm-wide MFA policy, Google or Microsoft SSO, and step-up verification.",
      "AES-256-GCM encrypted credentials and a tamper-evident sensitive-action trail.",
      "Full exports, granular deletion, and safeguards for destructive actions.",
      "Bring-your-own Claude, Gemini, OpenAI, or OpenRouter keys with no platform model markup and per-task model defaults.",
      "Optional CourtListener research keys for higher-rate US case-law access when a firm needs it.",
    ],
  },
  {
    title: "Integrations & import",
    items: [
      "Google Drive and OneDrive import.",
      "Automatic conversion of Google Docs, Sheets, and Slides.",
      "Document import from a URL.",
      "Remote MCP-compatible tools with per-tool controls and confirmation for destructive actions.",
    ],
  },
];

const globalPlatformComparison = [
  ["India-first legal work", "Indian Kanoon research, court drafting, statutes, and practice conventions are the default context."],
  ["Model choice and cost control", "Your firm chooses its AI provider and pays the provider directly, without a platform markup."],
  ["Built around the matter", "Research, documents, review, drafting, conflicts, and firm knowledge remain in one India-oriented workspace."],
  ["Practical firm controls", "Role-based access, MFA, SSO, encrypted credentials, audit trails, exports, and deletion controls are built into the operating model."],
];

export default function RootPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#f5f0e8] font-serif text-[#1f1d1b]">
      <div className="relative isolate">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[48rem] bg-[radial-gradient(circle_at_16%_12%,rgba(100,24,39,0.17),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(196,171,143,0.34),transparent_31%),linear-gradient(135deg,#f8f4ed_0%,#eee2d2_100%)]" />
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
          <Link href="/" className="font-serif text-4xl leading-none tracking-tight text-[#1f1d1b]" aria-label="Gavel home">
            Gavel<span className="text-[#661827]">.</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm font-medium">
            <a
              href="tel:+918104610781"
              className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/45 px-4 py-2.5 text-[#58121f] shadow-[7px_7px_16px_rgba(121,101,73,0.12),-6px_-6px_14px_rgba(255,255,255,0.7)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/65"
            >
              Contact us <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </nav>
        </header>

        <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-32 lg:pt-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#641827] shadow-[5px_5px_13px_rgba(121,101,73,0.09),-5px_-5px_12px_rgba(255,255,255,0.65)] backdrop-blur-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-[#661827]" />
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
                className="inline-flex items-center gap-2 rounded-full bg-[#661827] px-5 py-3 text-sm font-semibold text-white shadow-[7px_7px_15px_rgba(85,18,31,0.24),-5px_-5px_12px_rgba(255,255,255,0.45)] transition hover:-translate-y-0.5 hover:bg-[#48101c]"
              >
                Contact us: +91 81046 10781 <ArrowUpRight className="h-4 w-4" />
              </a>
              <a
                href="#capabilities"
                className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/36 px-5 py-3 text-sm font-semibold text-[#501523] shadow-[6px_6px_14px_rgba(121,101,73,0.1),-5px_-5px_12px_rgba(255,255,255,0.65)] backdrop-blur-lg transition hover:-translate-y-0.5 hover:bg-white/60"
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
                      <p className="font-serif text-2xl leading-none text-[#1f1d1b]">Gavel<span className="text-[#661827]">.</span></p>
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
                      <p className="font-serif text-4xl text-[#661827] sm:text-5xl">{number}</p>
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
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#661827]">
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
                    className="h-6 w-6 text-[#661827]"
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

      <section id="capabilities" className="bg-[#f0e4d5] px-6 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#661827]">
              Full capability catalogue
            </p>
            <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.03em] text-[#261719] sm:text-5xl">
              Every capability in the Gavel evaluation pack.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#665e56]">
              From the first question on a matter to firm-wide governance, Gavel brings the practical tools of legal work into one India-first platform.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {capabilityCatalogue.map((capability) => (
              <article key={capability.title} className="rounded-2xl border border-white/75 bg-white/42 p-6 shadow-[8px_8px_18px_rgba(121,101,73,0.1),-7px_-7px_16px_rgba(255,255,255,0.68),inset_1px_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl">
                <h3 className="border-b border-[#661827]/20 pb-4 font-serif text-2xl text-[#541624]">
                  {capability.title}
                </h3>
                <ul className="mt-5 space-y-3 text-[0.98rem] leading-6 text-[#5f554d]">
                  {capability.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#661827]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#661827]/15 bg-[#f8f1e7] px-6 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#661827]">
              Why Gavel for India
            </p>
            <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.03em] text-[#261719] sm:text-5xl">
              A better fit for Indian law firms than global legal AI platforms.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#665e56]">
              Harvey and Legora are powerful global platforms. Gavel is built around a different starting point: Indian law, Indian legal practice, and the commercial control Indian firms need from day one.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/42 shadow-[10px_10px_22px_rgba(121,101,73,0.1),-8px_-8px_18px_rgba(255,255,255,0.68),inset_1px_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl">
            {globalPlatformComparison.map(([title, detail], index) => (
              <div key={title} className={`grid gap-4 p-6 sm:grid-cols-[11rem_1fr] ${index !== 0 ? "border-t border-white/70" : ""}`}>
                <h3 className="font-serif text-xl text-[#661827]">{title}</h3>
                <p className="leading-7 text-[#5f554d]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="rounded-[1.75rem] border border-[#8d3342]/45 bg-[#661827] px-7 py-12 text-[#fffaf1] shadow-[15px_16px_32px_rgba(68,15,27,0.24),-8px_-8px_18px_rgba(255,255,255,0.46),inset_1px_1px_0_rgba(255,255,255,0.15)] sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between">
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
