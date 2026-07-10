import type { ColumnFormat } from "../shared/types";

export interface ColumnPreset {
    name: string;
    matches: RegExp;
    prompt: string;
    format: ColumnFormat;
    tags?: string[];
}

export const PROMPT_PRESETS: ColumnPreset[] = [
    {
        name: "Parties",
        matches: /\bpart(y|ies)\b/i,
        format: "bulleted_list",
        prompt: 'List all parties to this agreement. For each party, state their full legal name, entity type, and defined role, e.g.:\n• ABC Private Limited, a company incorporated under the Companies Act, 2013 ("Company")\n• Rajesh Kumar ("Shareholder")\nOne party per bullet. No additional commentary.',
    },
    {
        name: "Governing Law",
        matches: /\bgoverning law\b|\bjurisdiction\b/i,
        format: "text",
        prompt: 'State only the governing law of this agreement using the short-form jurisdiction name, e.g. "Indian Law", "English Law", "New York Law". If Indian, also name the courts given exclusive jurisdiction (e.g. "Indian Law — courts at Mumbai"). No other text.',
    },
    {
        name: "Effective Date",
        matches: /\beffective date\b/i,
        format: "date",
        prompt: 'State only the effective date of this agreement in DD Mon YYYY format, e.g. "2 Jan 2026". If not explicitly stated, write "Not specified".',
    },
    {
        name: "Term",
        matches: /\bterm\b|\bduration\b/i,
        format: "text",
        prompt: 'State only the duration or term of this agreement in a concise form, e.g. "3 years", "24 months", "perpetual". No other text.',
    },
    {
        name: "Termination",
        matches: /\bterminat(e|ion|ing)\b/i,
        format: "text",
        prompt: "Extract the termination provisions. State who may terminate, the trigger events, required notice period, any cure period, and the key consequences of termination. Be concise.",
    },
    {
        name: "Change of Control",
        matches: /\bchange of control\b/i,
        format: "text",
        prompt: "Identify any change of control provisions. Summarize the trigger events, consequences, consent requirements, and any related termination or acceleration rights. Be concise.",
    },
    {
        name: "Confidentiality",
        matches: /\bconfidential(ity)?\b|\bnon-?disclosure\b/i,
        format: "text",
        prompt: "Summarize the confidentiality obligations: scope of confidential information, permitted disclosures, use restrictions, duration, and key carve-outs or exceptions.",
    },
    {
        name: "Assignment",
        matches: /\bassign(ment|ability)?\b/i,
        format: "yes_no",
        prompt: "Is assignment of this agreement permitted without the other party's consent?",
    },
    {
        name: "Payment & Fees",
        matches: /\bpayment\b|\bfees?\b/i,
        format: "text",
        prompt: 'State the key payment obligations concisely: amount, timing, and currency, e.g. "₹10,00,000 (Rupees Ten Lakh) payable within 30 days of invoice". Note any late payment consequences and whether amounts are inclusive or exclusive of GST.',
    },
    {
        name: "Amendment",
        matches: /\bamendment\b|\bvariation\b/i,
        format: "text",
        prompt: "Summarize the amendment provisions: how amendments may be made, who must consent, and any formality requirements such as writing or signature.",
    },
    {
        name: "Indemnity",
        matches: /\bindemni(ty|ties|fication)\b/i,
        format: "text",
        prompt: "Summarize the indemnity provisions: who indemnifies whom, the scope of indemnified losses, any liability caps or exclusions, and key claims procedures.",
    },
    {
        name: "Warranties",
        matches: /\bwarrant(y|ies|ing)\b|\brepresentations?\b/i,
        format: "text",
        prompt: "Identify and describe key representations and warranties provided by any party, including the scope of such assurances and any specific time periods or conditions applicable to them. In particular highlight any non-standard warranties.",
    },
    {
        name: "Force Majeure",
        matches: /\bforce majeure\b/i,
        format: "yes_no",
        prompt: "Does this agreement contain a force majeure clause?",
    },
    {
        name: "Arbitration",
        matches: /\barbitrat(e|ion|or)\b|\bdispute resolution\b/i,
        format: "text",
        prompt: "Summarize the dispute resolution / arbitration clause: seat and venue of arbitration, number of arbitrators and appointment mechanism, governing rules (e.g. Arbitration and Conciliation Act, 1996; institutional rules such as MCIA/DIAC/SIAC), language, and any pre-arbitration steps (negotiation, mediation). If there is no arbitration clause, state the forum for disputes.",
    },
    {
        name: "Stamp Duty & Registration",
        matches: /\bstamp\b|\bregistration\b|\bregistered\b/i,
        format: "text",
        prompt: "Identify any provisions on stamp duty and registration: who bears stamp duty, the state whose stamp law applies, whether the document is required or stated to be registered (e.g. under the Registration Act, 1908), and any recitals of stamp paper value. If the document type ordinarily requires stamping or registration in India but the document is silent, flag this.",
    },
    {
        name: "GST",
        matches: /\bGST\b|\bgoods and services tax\b/i,
        format: "text",
        prompt: "Summarize the GST treatment: whether prices are inclusive or exclusive of GST, who bears GST, invoicing and input tax credit obligations, and any GST indemnity or gross-up provisions.",
    },
    {
        name: "Notice Details",
        matches: /\bnotices?\b/i,
        format: "text",
        prompt: "Summarize the notice provisions: permitted modes of service (post, courier, email), addresses, deemed-delivery timelines, and any requirement of notice before legal action.",
    },
];

export function getPresetConfig(
    title: string,
): Pick<ColumnPreset, "prompt" | "format" | "tags"> | null {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const preset = PROMPT_PRESETS.find(({ matches }) => matches.test(trimmed));
    if (!preset) return null;
    return { prompt: preset.prompt, format: preset.format, tags: preset.tags };
}

export function getPresetPrompt(title: string): string | null {
    return getPresetConfig(title)?.prompt ?? null;
}
