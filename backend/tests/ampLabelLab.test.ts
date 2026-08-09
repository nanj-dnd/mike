import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AmpLabelLabPurgeError,
  ampLabelLabApiBaseUrl,
  purgeAmpLabelLabAccount,
} from "../src/lib/ampLabelLab";

const PURGE_SECRET = "test-only-purge-secret-that-is-at-least-32-bytes";

async function withApiBase<T>(
  value: string | undefined,
  run: () => Promise<T>,
) {
  const original = process.env.AMP_LABEL_LAB_API_BASE_URL;
  if (value === undefined) delete process.env.AMP_LABEL_LAB_API_BASE_URL;
  else process.env.AMP_LABEL_LAB_API_BASE_URL = value;
  try {
    return await run();
  } finally {
    if (original === undefined) delete process.env.AMP_LABEL_LAB_API_BASE_URL;
    else process.env.AMP_LABEL_LAB_API_BASE_URL = original;
  }
}

async function withPurgeSecret<T>(
  value: string | undefined,
  run: () => Promise<T>,
) {
  const original = process.env.LABEL_LAB_PURGE_SECRET;
  if (value === undefined) delete process.env.LABEL_LAB_PURGE_SECRET;
  else process.env.LABEL_LAB_PURGE_SECRET = value;
  try {
    return await run();
  } finally {
    if (original === undefined) delete process.env.LABEL_LAB_PURGE_SECRET;
    else process.env.LABEL_LAB_PURGE_SECRET = original;
  }
}

test("uses the safe production Label Lab URL by default", async () => {
  await withApiBase(undefined, async () => {
    assert.equal(
      ampLabelLabApiBaseUrl(),
      "https://amp-label-lab.anshulyemul.chatgpt.site",
    );
  });
});

test("purge forwards the current bearer with the required origin and CSRF header", async () => {
  await withApiBase("https://labels.example.test/base/", () =>
    withPurgeSecret(PURGE_SECRET, async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      await purgeAmpLabelLabAccount("current-user-jwt", async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return new Response(null, { status: 204 });
      });

      assert.equal(
        capturedUrl,
        "https://labels.example.test/base/api/internal/account-purge",
      );
            assert.equal(capturedInit?.method, "DELETE");
            assert.equal(capturedInit?.redirect, "error");
            assert.equal(capturedInit?.cache, "no-store");
            assert.ok(capturedInit?.signal instanceof AbortSignal);
            assert.equal(capturedInit?.signal?.aborted, false);
      assert.deepEqual(capturedInit?.headers, {
        Accept: "application/json",
        Authorization: "Bearer current-user-jwt",
        Origin: "https://www.trygavel.in",
        "X-AMP-Lab-CSRF": "1",
        "X-AMP-Lab-Purge-Secret": PURGE_SECRET,
      });
    }),
  );
});

test("purge rejects missing bearer credentials before making a request", async () => {
  let called = false;
  await assert.rejects(
    purgeAmpLabelLabAccount("", async () => {
      called = true;
      return new Response(null, { status: 204 });
    }),
    AmpLabelLabPurgeError,
  );
  assert.equal(called, false);
});

test("purge fails closed when the server-only purge secret is missing", async () => {
  await withPurgeSecret(undefined, async () => {
    let called = false;
    await assert.rejects(
      purgeAmpLabelLabAccount("current-user-jwt", async () => {
        called = true;
        return new Response(null, { status: 204 });
      }),
      /not configured/,
    );
    assert.equal(called, false);
  });
});

test("purge fails closed when the server-only purge secret is too short", async () => {
  await withPurgeSecret("too-short", async () => {
    let called = false;
    await assert.rejects(
      purgeAmpLabelLabAccount("current-user-jwt", async () => {
        called = true;
        return new Response(null, { status: 204 });
      }),
      /32-byte/,
    );
    assert.equal(called, false);
  });
});

test("purge failures abort without echoing upstream account details", async () => {
  await withPurgeSecret(PURGE_SECRET, async () => {
    await assert.rejects(
      purgeAmpLabelLabAccount(
        "current-user-jwt",
        async () =>
          new Response(
            JSON.stringify({
              error: "user@example.com current-user-jwt",
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
      (error: unknown) => {
        assert.ok(error instanceof AmpLabelLabPurgeError);
        assert.match(error.message, /failed with status 503/);
        assert.doesNotMatch(error.message, /user@example\.com/);
        assert.doesNotMatch(error.message, /current-user-jwt/);
        return true;
      },
    );
  });
});

test("unsafe API base URLs are rejected", async () => {
  await withApiBase("http://labels.example.test", async () => {
    assert.throws(() => ampLabelLabApiBaseUrl(), AmpLabelLabPurgeError);
  });
  await withApiBase("https://user:secret@labels.example.test", async () => {
    assert.throws(() => ampLabelLabApiBaseUrl(), AmpLabelLabPurgeError);
  });
});

test("the external purge is ordered before any local account deletion", async () => {
  const source = await readFile(
    new URL("../src/routes/user.ts", import.meta.url),
    "utf8",
  );
  const route = source.slice(source.indexOf("// DELETE /user/account"));
  const purgeIndex = route.indexOf(
    "await purgeAmpLabelLabAccount(res.locals.token as string)",
  );
  const localDeleteIndex = route.indexOf("await deleteUserAccountData");
  const authDeleteIndex = route.indexOf("await db.auth.admin.deleteUser");

  assert.ok(purgeIndex >= 0);
  assert.ok(purgeIndex < localDeleteIndex);
  assert.ok(localDeleteIndex < authDeleteIndex);
});
