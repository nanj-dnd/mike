import { test } from "node:test";
import assert from "node:assert/strict";
import { stripIkHtml, isIndianKanoonEnabled } from "../src/lib/indiankanoon";

test("stripIkHtml strips tags and decodes entities", () => {
    assert.equal(
        stripIkHtml("<b>Kesavananda</b> &amp; Others v. <i>State of Kerala</i>"),
        "Kesavananda & Others v. State of Kerala",
    );
    assert.equal(stripIkHtml("a&nbsp;b &lt;c&gt; &quot;d&quot; &#39;e&#39;"), 'a b <c> "d" \'e\'');
});

test("stripIkHtml converts block elements to line breaks", () => {
    const text = stripIkHtml("<p>Para one.</p><p>Para two.</p>");
    assert.match(text, /Para one\.\nPara two\./);
});

test("stripIkHtml drops style and script blocks entirely", () => {
    assert.equal(
        stripIkHtml("<style>.x{color:red}</style>Hello<script>alert(1)</script>"),
        "Hello",
    );
});

test("isIndianKanoonEnabled tracks the env token", () => {
    const original = process.env.INDIAN_KANOON_API_TOKEN;
    try {
        delete process.env.INDIAN_KANOON_API_TOKEN;
        assert.equal(isIndianKanoonEnabled(), false);
        process.env.INDIAN_KANOON_API_TOKEN = "   ";
        assert.equal(isIndianKanoonEnabled(), false);
        process.env.INDIAN_KANOON_API_TOKEN = "token";
        assert.equal(isIndianKanoonEnabled(), true);
    } finally {
        if (original === undefined) delete process.env.INDIAN_KANOON_API_TOKEN;
        else process.env.INDIAN_KANOON_API_TOKEN = original;
    }
});
