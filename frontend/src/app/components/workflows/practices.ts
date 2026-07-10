export const PRACTICE_OPTIONS = [
    "General Corporate",
    "Litigation & Disputes",
    "Arbitration",
    "Banking & Finance",
    "Capital Markets (SEBI)",
    "Insolvency & IBC",
    "Real Estate & RERA",
    "Tax & GST",
    "Employment & Labour",
    "IP",
    "Competition (CCI)",
    "TMT & Data Protection",
    "Private Equity / VC",
    "M&A",
    "Regulatory & Compliance",
    "Criminal",
    "Family & Succession",
    "Consumer Disputes",
    "Other",
] as const;

export type Practice = (typeof PRACTICE_OPTIONS)[number];
