import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractDocxReviewMarkup } from "../src/lib/documentReviewMarkup";

async function buildDocx(options: {
    documentXml: string;
    commentsXml?: string;
}): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
        "[Content_Types].xml",
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    );
    zip.file("word/document.xml", options.documentXml);
    if (options.commentsXml) {
        zip.file("word/comments.xml", options.commentsXml);
    }
    return zip.generateAsync({ type: "nodebuffer" });
}

const DOC_WITH_MARKUP = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>The notice period shall be </w:t></w:r>
      <w:del w:id="1" w:author="Rahul Mehta" w:date="2026-06-01T10:00:00Z">
        <w:r><w:delText>thirty (30) days</w:delText></w:r>
      </w:del>
      <w:ins w:id="2" w:author="Priya Raghavan" w:date="2026-06-02T11:30:00Z">
        <w:r><w:t>sixty (60) days</w:t></w:r>
      </w:ins>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:p>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:t>Liability is capped at fees paid.</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:commentReference w:id="0"/></w:r>
    </w:p>
  </w:body>
</w:document>`;

const COMMENTS_XML = `<?xml version="1.0"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="Anita Desai" w:date="2026-06-03T09:15:00Z">
    <w:p><w:r><w:t>Client wants this cap raised to 2x fees &amp; carve-outs for IP claims.</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;

test("extractDocxReviewMarkup surfaces insertions, deletions, and authors", async () => {
    const buf = await buildDocx({
        documentXml: DOC_WITH_MARKUP,
        commentsXml: COMMENTS_XML,
    });
    const markup = await extractDocxReviewMarkup(buf);
    assert.match(markup, /## Review Markup/);
    assert.match(markup, /Deletion by Rahul Mehta on 2026-06-01: "thirty \(30\) days"/);
    assert.match(markup, /Insertion by Priya Raghavan on 2026-06-02: "sixty \(60\) days"/);
});

test("extractDocxReviewMarkup surfaces comment bubbles with anchor text", async () => {
    const buf = await buildDocx({
        documentXml: DOC_WITH_MARKUP,
        commentsXml: COMMENTS_XML,
    });
    const markup = await extractDocxReviewMarkup(buf);
    assert.match(markup, /### Comments/);
    assert.match(markup, /Comment by Anita Desai on 2026-06-03/);
    assert.match(markup, /on the text: "Liability is capped at fees paid\."/);
    // Entity decoding
    assert.match(markup, /2x fees & carve-outs/);
});

test("extractDocxReviewMarkup returns empty for clean documents", async () => {
    const clean = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>No markup here.</w:t></w:r></w:p></w:body>
</w:document>`;
    const buf = await buildDocx({ documentXml: clean });
    assert.equal(await extractDocxReviewMarkup(buf), "");
});

test("extractDocxReviewMarkup tolerates non-docx garbage", async () => {
    assert.equal(
        await extractDocxReviewMarkup(Buffer.from("not a zip at all")),
        "",
    );
});
