import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyUptimeClass, formatDailyDate, formatDailyUptime } from "../../src/util/daily-uptime";

test("daily values distinguish unknown, 100%, partial and 0%", () => {
    assert.deepEqual([null, 1, 0.75, 0].map(dailyUptimeClass), ["unknown", "up", "partial", "down"]);
    assert.deepEqual([null, 1, 0.75, 0].map(formatDailyUptime), [null, "100.00", "75.00", "0.00"]);
});

test("rounded values never turn partial samples into 0% or 100%", () => {
    assert.deepEqual([0.000001, 0.999999].map(formatDailyUptime), ["<0.01", ">99.99"]);
});

test("daily labels use the UTC date even at a local calendar boundary", () => {
    assert.equal(formatDailyDate(Date.parse("2024-02-29T00:00:00Z") / 1000), "2024-02-29");
    assert.equal(formatDailyDate(Date.parse("2024-03-01T00:00:00Z") / 1000), "2024-03-01");
});
