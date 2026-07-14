import { Resend } from "resend";
import { primaryFrontendUrl } from "./frontendUrls";

/**
 * Outbound email via Resend. Fire-and-forget for non-critical mail (org
 * invites): failures are logged, never thrown — the in-app flow works
 * regardless. Note Resend's SDK does NOT throw on send failure; the
 * error comes back in the { error } field and must be checked.
 */

const FROM =
    process.env.EMAIL_FROM?.trim() || "Gavel <noreply@primafacie.in>";
const APP_URL = primaryFrontendUrl();

function client(): Resend | null {
    const key = process.env.RESEND_API_KEY?.trim();
    return key ? new Resend(key) : null;
}

export function sendOrgInviteEmail(params: {
    to: string;
    orgName: string;
    invitedByEmail: string;
    role: string;
}): void {
    const resend = client();
    if (!resend) return; // Email not configured; in-app invite still works.

    const { to, orgName, invitedByEmail, role } = params;
    void resend.emails
        .send({
            from: FROM,
            to,
            subject: `You've been added to ${orgName} on Gavel`,
            text: [
                `${invitedByEmail} has added you to the "${orgName}" workspace on Gavel (role: ${role}).`,
                ``,
                `Gavel is an AI legal platform for Indian law firms — document analysis, drafting, case-law research, and contract review.`,
                ``,
                `If you already have a Gavel account under this email address, your membership is active — open ${APP_URL} and you're in.`,
                ``,
                `If not, create an account using this email address:`,
                `${APP_URL}/signup`,
                ``,
                `Your membership activates automatically the first time you open Settings → Organization.`,
            ].join("\n"),
        })
        .then(({ error }) => {
            // Resend does not throw; the failure lives in { error }.
            if (error) {
                console.error(
                    `[email] org invite to ${to} failed:`,
                    error.message ?? error,
                );
            }
        })
        .catch((err) => {
            console.error(
                `[email] org invite to ${to} failed:`,
                err instanceof Error ? err.message : err,
            );
        });
}
