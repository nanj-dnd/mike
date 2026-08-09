import assert from "node:assert/strict";
import { test } from "node:test";
import { isMissingOptionalTableError } from "../src/lib/userDataCleanup";

const TABLE = "workflow_open_source_submissions";

test("recognizes the optional workflow submissions table missing from PostgREST", () => {
  assert.equal(
    isMissingOptionalTableError(
      {
        code: "PGRST205",
        message:
          "Could not find the table 'public.workflow_open_source_submissions' in the schema cache",
      },
      TABLE,
    ),
    true,
  );
  assert.equal(
    isMissingOptionalTableError(
      {
        code: "42P01",
        message: 'relation "workflow_open_source_submissions" does not exist',
      },
      TABLE,
    ),
    true,
  );
});

test("does not hide unrelated database cleanup failures", () => {
  assert.equal(
    isMissingOptionalTableError(
      { code: "42501", message: "permission denied" },
      TABLE,
    ),
    false,
  );
  assert.equal(
    isMissingOptionalTableError(
      {
        code: "PGRST205",
        message: "Could not find the table 'public.workflows'",
      },
      TABLE,
    ),
    false,
  );
});
