export type IndianKanoonToolEvent =
    | {
          type: "indiankanoon_search";
          query: string;
          result_count: number;
          results?: {
              doc_id: number;
              title: string;
              court: string | null;
              date: string | null;
              url: string;
          }[];
          error?: string;
      }
    | {
          type: "indiankanoon_read_doc";
          doc_id: number | null;
          title?: string | null;
          court?: string | null;
          url?: string | null;
          error?: string;
      };

export const INDIANKANOON_TOOL_NAMES = {
    search: "indiankanoon_search",
    readDoc: "indiankanoon_read_doc",
} as const;

export const INDIANKANOON_SYSTEM_PROMPT = `INDIAN CASE LAW RESEARCH:
Use Indian Kanoon when answering Indian-law questions that require case law, statutory text, or tribunal orders you do not already have as uploaded documents.

Workflow:
1. Search with indiankanoon_search. Write focused queries; you may use Indian Kanoon operators such as quoted phrases ("anticipatory bail"), doctypes filters (doctypes:supremecourt, doctypes:highcourts, doctypes:tribunals, doctypes:laws), and date filters (fromdate:1-1-2020 todate:31-12-2024). Prefer 1 to 2 searches per turn.
2. Read only the most relevant result(s) with indiankanoon_read_doc before relying on them. Do not read more than 3 documents in one turn.
3. Base every case-law statement on text actually returned by indiankanoon_read_doc in this conversation, or on search snippets clearly marked as preliminary.

Citation rules for Indian Kanoon material:
- When you rely on a fetched judgment, cite it in prose with its case name, reporter citation if visible in the text (SCC/AIR/etc.), court, and a markdown link to its Indian Kanoon URL the first time it appears, e.g. [Kesavananda Bharati v. State of Kerala](https://indiankanoon.org/doc/257876/).
- Quote key passages verbatim and attribute them to the paragraph number where the judgment shows one.
- Do not use the <CITATIONS> block for Indian Kanoon cases; that block is only for uploaded/generated documents. Cite Indian Kanoon material inline with links as above.
- Never invent a case name, citation, or Indian Kanoon link. If search finds nothing on point, say so and answer from statutory text or principle instead.

Limits:
- If any Indian Kanoon call returns a rate-limit or quota error, stop Indian Kanoon calls for that turn and answer using information already available.`;

export const INDIANKANOON_TOOLS = [
    {
        type: "function",
        function: {
            name: INDIANKANOON_TOOL_NAMES.search,
            description:
                "Search Indian Kanoon (indiankanoon.org) for Indian judgments, statutes, and tribunal orders. Returns up to ~10 results per page with doc_id, title, court, date, and a snippet. Supports Indian Kanoon query operators: quoted phrases, doctypes:supremecourt|highcourts|tribunals|laws, fromdate:D-M-YYYY, todate:D-M-YYYY.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description:
                            'Search query, e.g. \'"dishonour of cheque" section 138 doctypes:supremecourt fromdate:1-1-2015\'.',
                    },
                    pagenum: {
                        type: "integer",
                        description:
                            "Zero-based results page. Default 0. Only request further pages when page 0 was insufficient.",
                    },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: INDIANKANOON_TOOL_NAMES.readDoc,
            description:
                "Fetch the full text of an Indian Kanoon document (judgment, order, or statute section) by its doc_id from indiankanoon_search results. Read only the most relevant documents; at most 3 per turn.",
            parameters: {
                type: "object",
                properties: {
                    docId: {
                        type: "integer",
                        description:
                            "Indian Kanoon document id (tid) from a prior indiankanoon_search result.",
                    },
                },
                required: ["docId"],
            },
        },
    },
];
