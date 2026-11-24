const DAY_SECONDS = 86400;
const HISTORY_DAYS = 90;

/**
 * Fill the last 90 UTC calendar days from sparse sample buckets.
 * @param {object[]} rows Daily calculator buckets
 * @param {number} now Current time in milliseconds
 * @returns {object[]} Chronological public timestamp and uptime pairs
 */
function makeDailyUptime(rows, now = Date.now()) {
    const today = Math.floor(now / (DAY_SECONDS * 1000)) * DAY_SECONDS;
    const first = today - (HISTORY_DAYS - 1) * DAY_SECONDS;
    const buckets = new Map();
    for (const row of rows) {
        if (row.timestamp >= first && row.timestamp <= today && (row.timestamp - first) % DAY_SECONDS === 0) {
            const up = Number(row.up);
            const down = Number(row.down);
            const total = up + down;
            buckets.set(row.timestamp, total > 0 ? up / total : null);
        }
    }
    return Array.from({ length: HISTORY_DAYS }, (_, index) => {
        const timestamp = first + index * DAY_SECONDS;
        return { timestamp, uptime: buckets.get(timestamp) ?? null };
    });
}

module.exports = { makeDailyUptime };
