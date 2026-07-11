import type { Metadata } from "next";
import Link from "next/link";
import { SiteLogo } from "@/app/components/site-logo";

export const metadata: Metadata = {
    title: "Privacy Policy – Gavel",
    description: "Privacy Policy for the Gavel AI legal platform.",
};

function Section({
    number,
    title,
    children,
}: {
    number: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <h2 className="text-xl font-medium font-serif text-gray-900">
                {number}. {title}
            </h2>
            <div className="space-y-3 text-sm leading-6 text-gray-700">
                {children}
            </div>
        </section>
    );
}

export default function PrivacyPage() {
    return (
        <div className="min-h-dvh bg-gray-50/80 px-6 py-10">
            <div className="mx-auto w-full max-w-3xl">
                <div className="mb-8 flex items-center justify-between">
                    <SiteLogo size="md" asLink />
                    <Link
                        href="/terms"
                        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        Terms of Service
                    </Link>
                </div>

                <h1 className="text-3xl font-medium font-serif text-gray-950 mb-2">
                    Privacy Policy
                </h1>
                <p className="text-sm text-gray-500 mb-10">
                    Last updated: 11 July 2026
                </p>

                <div className="space-y-10 pb-16">
                    <Section number="1" title="Introduction">
                        <p>
                            This Privacy Policy explains how Gavel
                            (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
                            &ldquo;our&rdquo;) collects, uses, and protects
                            personal data when you use the Gavel platform (the
                            &ldquo;Service&rdquo;). It is published in
                            accordance with the Digital Personal Data
                            Protection Act, 2023 (&ldquo;DPDP Act&rdquo;), the
                            Information Technology Act, 2000, and the rules
                            made under them. For personal data you provide, we
                            act as the data fiduciary.
                        </p>
                        <p>
                            Where you upload documents containing personal
                            data of your clients or other third parties, you
                            (or your firm) determine the purpose of that
                            processing, and we process such data on your
                            instructions to provide the Service. You are
                            responsible for having a lawful basis and any
                            required consents for that data.
                        </p>
                    </Section>

                    <Section number="2" title="Data We Collect">
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                <strong>Account data:</strong> name, email
                                address, organisation, and password
                                (stored only as a secure hash).
                            </li>
                            <li>
                                <strong>Content:</strong> documents you
                                upload, prompts and chat messages, tabular
                                reviews, workflows, and output generated for
                                you.
                            </li>
                            <li>
                                <strong>Configuration:</strong> optional API
                                keys you add (stored encrypted), connector
                                settings, and preferences.
                            </li>
                            <li>
                                <strong>Usage and technical data:</strong>{" "}
                                log data such as IP address, browser type,
                                pages accessed, and timestamps, used for
                                security and service operation.
                            </li>
                        </ul>
                    </Section>

                    <Section number="3" title="How We Use Data">
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                to provide the Service: authentication,
                                document storage and analysis, AI chat,
                                research, and drafting;
                            </li>
                            <li>
                                to operate, secure, and improve the Service,
                                including preventing abuse;
                            </li>
                            <li>to respond to support requests;</li>
                            <li>to comply with legal obligations.</li>
                        </ul>
                        <p>
                            We do not sell personal data, and we do not use
                            your documents or chats to train AI models.
                        </p>
                    </Section>

                    <Section number="4" title="Processors and Transfers">
                        <p>
                            We use reputable third-party processors to run the
                            Service. Depending on the feature used, data is
                            processed by:
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                <strong>Supabase</strong> — database and
                                authentication;
                            </li>
                            <li>
                                <strong>Cloudflare R2</strong> — encrypted
                                document storage;
                            </li>
                            <li>
                                <strong>Google (Gemini)</strong> and, where
                                you configure your own keys, other AI model
                                providers — portions of documents and prompts
                                are transmitted to generate AI responses;
                            </li>
                            <li>
                                <strong>Vercel and Railway</strong> — hosting
                                of the application;
                            </li>
                            <li>
                                <strong>Indian Kanoon</strong> — case-law
                                search queries.
                            </li>
                        </ul>
                        <p>
                            Some of these providers store or process data on
                            servers located outside India. By using the
                            Service you consent to such cross-border
                            processing, which we permit only as allowed under
                            the DPDP Act. Each provider is bound by its own
                            security and data-protection commitments.
                        </p>
                    </Section>

                    <Section number="5" title="Security">
                        <p>
                            All data is transmitted over TLS. Documents are
                            stored in access-controlled object storage; API
                            keys you add are encrypted at rest; passwords are
                            hashed. Access to production systems is
                            restricted. No system is perfectly secure, and we
                            will notify you and the relevant authorities of a
                            personal data breach where required by law.
                        </p>
                    </Section>

                    <Section number="6" title="Retention and Deletion">
                        <p>
                            We retain your data for as long as your account is
                            active. You can export your account data, chats,
                            and tabular reviews, and delete documents, chats,
                            or your entire account, from the{" "}
                            <strong>Account → Privacy &amp; Data</strong>{" "}
                            section. On account deletion, your content is
                            removed from active systems within a reasonable
                            period, subject to residual copies in backups that
                            expire in the ordinary course and any retention
                            required by law.
                        </p>
                    </Section>

                    <Section number="7" title="Your Rights">
                        <p>
                            Under the DPDP Act you have the right to access a
                            summary of your personal data, correct or update
                            it, erase it, nominate a person to exercise your
                            rights, and have grievances redressed. Most of
                            these can be exercised directly in the app
                            (Account section); for anything else, contact us
                            via the{" "}
                            <Link
                                href="/support"
                                className="text-blue-600 hover:underline"
                            >
                                Support page
                            </Link>
                            . If you are not satisfied with our response, you
                            may complain to the Data Protection Board of
                            India.
                        </p>
                    </Section>

                    <Section number="8" title="Cookies and Local Storage">
                        <p>
                            The Service uses strictly necessary cookies and
                            browser storage to keep you signed in and to
                            remember interface preferences. We do not use
                            third-party advertising or tracking cookies.
                        </p>
                    </Section>

                    <Section number="9" title="Children">
                        <p>
                            The Service is intended for legal professionals
                            and is not directed at children. We do not
                            knowingly process personal data of persons under
                            18 as users.
                        </p>
                    </Section>

                    <Section number="10" title="Changes">
                        <p>
                            We may update this Privacy Policy from time to
                            time. The updated version will be posted on this
                            page with a revised date. Material changes will be
                            notified within the app.
                        </p>
                    </Section>

                    <Section number="11" title="Grievance Redressal">
                        <p>
                            Grievances relating to personal data are handled
                            by our grievance officer, reachable via the{" "}
                            <Link
                                href="/support"
                                className="text-blue-600 hover:underline"
                            >
                                Support page
                            </Link>
                            . We aim to acknowledge grievances within 72 hours
                            and resolve them within the timelines prescribed
                            by applicable law.
                        </p>
                    </Section>
                </div>
            </div>
        </div>
    );
}
