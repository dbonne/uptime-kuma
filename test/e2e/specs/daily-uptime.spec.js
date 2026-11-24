import { expect, test } from "../fixtures";

const DAY = 86400;
const start = Date.parse("2024-01-01T00:00:00Z") / 1000;
const days = Array.from({ length: 90 }, (_, index) => ({
    timestamp: start + index * DAY,
    uptime: index === 88 ? 0.75 : index === 89 ? 1 : null,
}));

/**
 * Serve an isolated public-page fixture without authentication or real monitors.
 * @param {import('@playwright/test').Page} page Browser page
 * @param {object} state Request counters and failure switch
 * @returns {Promise<void>}
 */
async function openFixture(page, state) {
    await page.addInitScript((theme) => {
        window.preloadData = {
            config: { title: "Fixture", slug: "fixture", theme, autoRefreshInterval: 5, published: true },
            publicGroupList: [{ id: 1, name: "Public", monitorList: [{ id: 11, name: "Web service" }] }],
            maintenanceList: [],
            incidents: [],
        };
    }, state.theme || "dark");
    // The server returns the SPA shell even for an unknown status-page slug.
    await page.route("**/status/fixture", async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, status: 200 });
    });
    await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: null }));
    await page.route("**/api/status-page/fixture/incident-history*", (route) => route.fulfill({
        json: { ok: true, incidents: [], nextCursor: null, hasMore: false },
    }));
    await page.route("**/api/status-page/heartbeat/fixture*", (route) => {
        state.heartbeats++;
        const up = state.heartbeats === 1;
        return route.fulfill({ json: {
            heartbeatList: { 11: [{ status: up ? 1 : 0, time: "2024-03-30 00:00:00" }] },
            uptimeList: { "11_24": up ? 1 : 0 },
        } });
    });
    await page.route("**/api/status-page/fixture/uptime/daily*", (route) => {
        state.histories++;
        if (state.failHistory && state.histories > 1) {
            return route.fulfill({ status: 503, json: { status: "fail" } });
        }
        return route.fulfill({ json: { dailyUptimeList: { 11: days } } });
    });
    await page.goto("/status/fixture");
}

test("keeps all 90 UTC days selectable on a narrow dark page", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openFixture(page, { heartbeats: 0, histories: 0, failHistory: false });
    const chart = page.getByTestId("daily-uptime");
    await expect(chart.getByTestId("daily-uptime-day")).toHaveCount(90);
    const select = chart.getByRole("combobox", { name: "Select a day for Web service" });
    await expect(select.locator("option")).toHaveCount(90);
    await expect(chart.getByTestId("daily-uptime-detail")).toHaveText("2024-03-30 UTC · 100.00% uptime");
    await select.selectOption("0");
    await expect(chart.getByTestId("daily-uptime-detail")).toHaveText("2024-01-01 UTC · No data");
    await select.selectOption("87");
    await select.focus();
    await select.press("ArrowDown");
    await select.press("Enter");
    await expect(chart.getByTestId("daily-uptime-detail")).toHaveText("2024-03-29 UTC · 75.00% uptime");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("history failure does not stop the next heartbeat update", async ({ page }) => {
    const state = { heartbeats: 0, histories: 0, failHistory: true };
    await openFixture(page, state);
    await expect(page.getByTestId("daily-uptime-day")).toHaveCount(90);
    await expect(page.getByTestId("monitor").getByText("100%", { exact: true })).toBeVisible();
    await expect(page.getByText("Daily history is unavailable. It will be retried at the next refresh.")).toBeVisible({
        timeout: 12000,
    });
    await expect(page.getByTestId("monitor").getByText("0%", { exact: true })).toBeVisible();
    expect(state.heartbeats).toBeGreaterThanOrEqual(2);
    expect(state.histories).toBeGreaterThanOrEqual(2);
});

test("renders the complete history on a light desktop page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFixture(page, { heartbeats: 0, histories: 0, failHistory: false, theme: "light" });
    const chart = page.getByTestId("daily-uptime");
    await expect(chart.getByTestId("daily-uptime-day")).toHaveCount(90);
    await expect(chart.getByTestId("daily-uptime-detail")).toHaveText("2024-03-30 UTC · 100.00% uptime");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test.describe("touch selection", () => {
    test.use({ hasTouch: true, viewport: { width: 375, height: 800 } });

    test("provides a full-sized touch control for every UTC date", async ({ page }) => {
        await openFixture(page, { heartbeats: 0, histories: 0, failHistory: false });
        const select = page.getByRole("combobox", { name: "Select a day for Web service" });
        const box = await select.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        await select.tap();
        await select.press("Escape");
        await select.selectOption("88");
        await expect(page.getByTestId("daily-uptime-detail")).toHaveText("2024-03-29 UTC · 75.00% uptime");
        await expect(select.locator("option")).toHaveCount(90);
    });
});
