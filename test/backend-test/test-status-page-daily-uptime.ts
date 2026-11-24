import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import express from "express";
import dayjs from "dayjs";

const require = createRequire(import.meta.url);
const { R } = require("redbean-node");
const StatusPage = require("../../server/model/status_page");
const { UptimeCalculator } = require("../../server/uptime-calculator");
const { makeDailyUptime } = require("../../server/util/daily-uptime");
const cache = require("../../server/utils/response-cache");
const { UptimeKumaServer } = require("../../server/uptime-kuma-server");
const DAY = 86400;

// The database boundary is stubbed; Express routing, caching and calculators are real.
test("public daily uptime HTTP API", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2024-03-01T00:00:01Z") });
    const now = dayjs.utc();
    const today = now.startOf("day").unix();
    UptimeCalculator.currentDate = now;
    const calculators = new Map();
    for (const id of [11, 12, 22]) {
        const calc = new UptimeCalculator();
        calc.monitorID = id;
        calc.historyLoaded = true;
        calc.get24Hour = () => ({ uptime: 0.75 });
        calculators.set(id, calc);
    }
    const calc = calculators.get(11);
    const add = (offset, up, down, extra = {}) => calc.addHistoryEntry(calc.dailyUptimeDataList, today + offset * DAY, {
        up, down, ...extra,
    });
    add(-90, 1, 0); // excluded
    add(-89, 2, 0);
    add(-4, 3, 1, { secretMessage: "never public", avgPing: 999 });
    add(-3, 0, 5);
    add(-2, 0, 0, { maintenance: 4 });
    add(0, 0, 0);
    add(1, 1, 0); // excluded
    calculators.get(22).addHistoryEntry(calculators.get(22).dailyUptimeDataList, today, { up: 1, down: 0 });

    const groups = [
        { page: 1, public: true, monitor: 11 },
        { page: 1, public: true, monitor: 11 },
        { page: 1, public: true, monitor: 12 },
        { page: 1, public: false, monitor: 99 },
        { page: 2, public: true, monitor: 22 },
    ];
    const requests: number[] = [];
    let monitorQueries = 0;
    t.mock.method(StatusPage, "slugToID", async (slug: string) => ({ alpha: 1, beta: 2, heartbeat: 2, empty: 3 }[slug]));
    t.mock.method(R, "findOne", async (table: string, _sql: string, [slug]: string[]) => {
        if (table === "status_page" && slug === "daily-uptime") {
            return { title: "Daily page", slug: "daily-uptime", icon: "/icon.svg" };
        }
        return null;
    });
    t.mock.method(R, "getCol", async (sql: string, args: number[]) => {
        monitorQueries++;
        assert.match(sql, /public\s*=\s*1/i);
        assert.match(sql, /status_page_id\s*=\s*\?/i);
        assert.match(sql, /monitor_group\.group_id\s*=\s*`group`\.id/i);
        return groups.filter((group) => group.public && group.page === args[0]).map((group) => group.monitor);
    });
    t.mock.method(UptimeCalculator, "getUptimeCalculator", async (id: number) => {
        requests.push(id);
        assert.ok(calculators.has(id), `unexpected calculator ${id}`);
        return calculators.get(id);
    });
    t.mock.method(R, "getAll", async (_sql: string, [id]: number[]) => [{ id, status: 1 }]);
    t.mock.method(R, "convertToBeans", (_table: string, rows: object[]) => rows.map((row) => ({
        toPublicJSON: () => row,
    })));

    t.mock.method(UptimeKumaServer, "getInstance", () => ({ indexHTML: "" }));
    const router = require("../../server/routers/status-page-router");
    const app = express();
    app.use(router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    t.after(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        cache.clear();
        UptimeCalculator.currentDate = null;
    });

    await t.test("returns exactly 90 chronological UTC buckets for public monitors only", async () => {
        const response = await fetch(`${base}/api/status-page/ALPHA/uptime/daily`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("x-cache"), "miss");
        const expected = Array.from({ length: 90 }, (_, index) => ({ timestamp: today + (index - 89) * DAY, uptime: null }));
        expected[0].uptime = 1;
        expected[85].uptime = 0.75;
        expected[86].uptime = 0;
        const empty = expected.map(({ timestamp }) => ({ timestamp, uptime: null }));
        assert.deepEqual(await response.json(), { dailyUptimeList: { 11: expected, 12: empty } });
        assert.deepEqual(requests, [11, 12]);
    });

    await t.test("serves a cached result without loading calculators again", async () => {
        const before = requests.length;
        const response = await fetch(`${base}/api/status-page/ALPHA/uptime/daily`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("x-cache"), "hit");
        assert.equal(requests.length, before);
    });

    await t.test("isolates another page and supports an empty public group", async () => {
        const response = await fetch(`${base}/api/status-page/beta/uptime/daily`);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.deepEqual(Object.keys(body.dailyUptimeList), ["22"]);
        assert.equal(body.dailyUptimeList[22].length, 90);
        assert.deepEqual(body.dailyUptimeList[22][89], { timestamp: today, uptime: 1 });
        const empty = await fetch(`${base}/api/status-page/empty/uptime/daily`);
        assert.equal(empty.status, 200);
        assert.deepEqual(await empty.json(), { dailyUptimeList: {} });
    });

    await t.test("rejects an unknown slug before querying monitors", async () => {
        const before = requests.length;
        const queriesBefore = monitorQueries;
        const response = await fetch(`${base}/api/status-page/missing/uptime/daily`);
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { status: "fail", msg: "Status Page Not Found" });
        assert.equal(requests.length, before);
        assert.equal(monitorQueries, queriesBefore);
    });

    await t.test("supports a page named heartbeat without shadowing its existing route", async () => {
        const response = await fetch(`${base}/api/status-page/heartbeat/uptime/daily`);
        assert.equal(response.status, 200);
        assert.deepEqual(Object.keys((await response.json()).dailyUptimeList), ["22"]);
    });

    await t.test("preserves the manifest route for a page named daily-uptime", async () => {
        const response = await fetch(`${base}/api/status-page/daily-uptime/manifest.json`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            name: "Daily page",
            start_url: "/status/daily-uptime",
            display: "standalone",
            icons: [{ src: "/icon.svg", sizes: "128x128", type: "image/png" }],
        });
    });

    await t.test("preserves the existing heartbeat response shape and values", async () => {
        const response = await fetch(`${base}/api/status-page/heartbeat/alpha`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            heartbeatList: { 11: [{ id: 11, status: 1 }], 12: [{ id: 12, status: 1 }] },
            uptimeList: { "11_24": 0.75, "12_24": 0.75 },
        });
    });
});

test("daily bucket normalization observes UTC midnight and never carries forward uptime", () => {
    const midnight = Date.parse("2024-03-01T00:00:00Z") / 1000;
    const rows = [
        { timestamp: midnight, up: 0, down: 0, maintenance: 5 },
        { timestamp: midnight - DAY, up: 1, down: 3 },
        { timestamp: midnight - 90 * DAY, up: 1, down: 0 },
        { timestamp: midnight + DAY, up: 0, down: 1 },
    ];
    const result = makeDailyUptime(rows, Date.parse("2024-03-01T00:00:01Z"));
    assert.equal(result.length, 90);
    assert.deepEqual(result[0], { timestamp: midnight - 89 * DAY, uptime: null });
    assert.deepEqual(result[88], { timestamp: midnight - DAY, uptime: 0.25 });
    assert.deepEqual(result[89], { timestamp: midnight, uptime: null });
    const previous = makeDailyUptime(rows, Date.parse("2024-02-29T23:59:59Z"));
    assert.deepEqual(previous[89], { timestamp: midnight - DAY, uptime: 0.25 });
});
