/**
 * Classify a daily uptime ratio without treating missing samples as downtime.
 * @param {number|null} uptime Ratio of up samples to all counted samples
 * @returns {string} Visual state
 */
export function dailyUptimeClass(uptime) {
    if (uptime == null) {
        return "unknown";
    }
    if (uptime === 1) {
        return "up";
    }
    if (uptime === 0) {
        return "down";
    }
    return "partial";
}

/**
 * @param {number|null} uptime Daily uptime ratio
 * @returns {string|null} Percentage without its unit, or null for no samples
 */
export function formatDailyUptime(uptime) {
    if (uptime == null) {
        return null;
    }
    const percent = uptime * 100;
    if (percent > 0 && percent < 0.01) {
        return "<0.01";
    }
    if (percent < 100 && percent > 99.99) {
        return ">99.99";
    }
    return percent.toFixed(2);
}

/**
 * @param {number} timestamp UTC midnight in seconds
 * @returns {string} UTC calendar date
 */
export function formatDailyDate(timestamp) {
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
}
