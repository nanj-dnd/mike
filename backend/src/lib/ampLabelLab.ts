const DEFAULT_AMP_LABEL_LAB_API_BASE_URL =
  "https://amp-label-lab.anshulyemul.chatgpt.site";
const AMP_LABEL_LAB_REQUEST_ORIGIN = "https://www.trygavel.in";
const PURGE_TIMEOUT_MS = 10_000;

export class AmpLabelLabPurgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmpLabelLabPurgeError";
  }
}

export function ampLabelLabApiBaseUrl() {
  const configured =
    process.env.AMP_LABEL_LAB_API_BASE_URL?.trim() ||
    DEFAULT_AMP_LABEL_LAB_API_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new AmpLabelLabPurgeError(
      "AMP_LABEL_LAB_API_BASE_URL must be a valid HTTPS URL.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new AmpLabelLabPurgeError(
      "AMP_LABEL_LAB_API_BASE_URL must be a credential-free HTTPS URL without query parameters or a fragment.",
    );
  }

  return parsed.toString().replace(/\/+$/, "");
}

function labelLabPurgeSecret() {
  const secret = process.env.LABEL_LAB_PURGE_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new AmpLabelLabPurgeError(
      "Label Lab account purge is not configured with a 32-byte server secret.",
    );
  }
  return secret;
}

export async function purgeAmpLabelLabAccount(
  accessToken: string,
  request: typeof fetch = fetch,
) {
  if (!accessToken.trim()) {
    throw new AmpLabelLabPurgeError(
      "Cannot purge Label Lab data without the authenticated user token.",
    );
  }

  const purgeUrl = `${ampLabelLabApiBaseUrl()}/api/internal/account-purge`;
  const purgeSecret = labelLabPurgeSecret();

  let response: Response;
  try {
    response = await request(purgeUrl, {
      method: "DELETE",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        Origin: AMP_LABEL_LAB_REQUEST_ORIGIN,
        "X-AMP-Lab-CSRF": "1",
        "X-AMP-Lab-Purge-Secret": purgeSecret,
      },
    });
  } catch {
    throw new AmpLabelLabPurgeError(
      "Label Lab account purge could not be reached.",
    );
  }

  if (!response.ok) {
    throw new AmpLabelLabPurgeError(
      `Label Lab account purge failed with status ${response.status}.`,
    );
  }
}
