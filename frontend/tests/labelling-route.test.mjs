import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("labelling stays on trygavel while API traffic is transparently rewritten", async () => {
    const [config, component, gate] = await Promise.all([
        read("../next.config.ts"),
        read("../src/app/labelling/LabelLab.tsx"),
        read("../src/app/labelling/LabellingGate.tsx"),
    ]);

    assert.match(config, /source:\s*"\/labelling\/api\/:path\*"/);
    assert.match(
        config,
        /https:\/\/amp-label-lab\.anshulyemul\.chatgpt\.site\/api\/:path\*/,
    );
    assert.doesNotMatch(config, /async redirects\(\)/);
    assert.match(component, /\/labelling\/api\/videos/);
    assert.doesNotMatch(component, /fetch\("\/api\/videos/);
    assert.match(gate, /\/labelling\/api\/session/);
    assert.match(gate, /Authorization: `Bearer \$\{accessToken\}`/);
    assert.match(gate, /expiresAt/);
    assert.match(gate, /expiresAtMs - Date\.now\(\) - 90_000/);
    assert.match(gate, /window\.clearTimeout\(timer\)/);
    assert.match(component, /mediaResponse\.json\(\)\.catch\(\(\) => null\)/);
    assert.equal(
        [...`${component}\n${gate}`.matchAll(/method:\s*"(?:POST|PUT|DELETE)"/g)].length,
        [...`${component}\n${gate}`.matchAll(/"X-AMP-Lab-CSRF":\s*"1"/g)].length,
    );
});

test("tiered catalog contains the complete validated KPI set", async () => {
    const catalog = JSON.parse(
        await read("../src/app/labelling/data/amp-tiered-kpi-catalog.json"),
    );
    const kpis = catalog.routes.flatMap((route) => route.kpis);

    assert.equal(catalog.routes.length, 9);
    assert.equal(kpis.length, 131);
    assert.equal(new Set(kpis.map((kpi) => kpi.id)).size, 131);
    for (const route of catalog.routes) {
        assert.equal(route.total_weight_pct, 100);
    }
});

test("CSV v2, precise timing and scrollable KPI editing remain present", async () => {
    const [labels, component, styles] = await Promise.all([
        read("../src/app/labelling/lib/labels.ts"),
        read("../src/app/labelling/LabelLab.tsx"),
        read("../src/app/labelling/labelling.css"),
    ]);

    assert.match(labels, /amp-training-labels-long-v2/);
    assert.match(component, /2-second window · 1 ms steps/);
    assert.match(component, /−10 ms/);
    assert.match(component, /\+1 frame/);
    assert.match(styles, /\.amp-labelling \.annotation-scroll\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(styles, /\.amp-labelling \.annotation-panel/);
});

test("authentication pages preserve the safe labelling return path", async () => {
    const [login, signup, helper, authContext] = await Promise.all([
        read("../src/app/login/page.tsx"),
        read("../src/app/signup/page.tsx"),
        read("../src/app/lib/authReturnPath.ts"),
        read("../src/app/contexts/AuthContext.tsx"),
    ]);

    assert.match(login, /authReturnPathFromLocation/);
    assert.match(signup, /authReturnPathFromLocation/);
    assert.match(helper, /candidate\.startsWith\("\/\/"\)/);
    assert.match(helper, /parsed\.origin !== base\.origin/);
    assert.match(authContext, /fetch\("\/labelling\/api\/session"/);
    assert.match(authContext, /method:\s*"DELETE"/);
    assert.match(authContext, /"X-AMP-Lab-CSRF":\s*"1"/);
    assert.match(authContext, /new AbortController\(\)/);
    assert.match(authContext, /controller\.abort\(\), 2_500/);
});

test("the private lab route is excluded from search indexing", async () => {
    const page = await read("../src/app/labelling/page.tsx");
    assert.match(page, /robots:\s*\{/);
    assert.match(page, /index:\s*false/);
    assert.match(page, /follow:\s*false/);
});
