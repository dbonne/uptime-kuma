# Daily uptime on public status pages

Public status pages show 90 UTC calendar days, oldest first and including today, for each monitor in a public group. Select a day to see its date and daily percentage; the current status and 24-hour percentage remain separate.

## How to read the history

- Each percentage is **up samples ÷ (up + down samples)** from the existing daily aggregate. Pending checks are counted as down by the calculator; maintenance samples are excluded.
- A missing day, a day with zero counted samples, or a maintenance-only day is gray and says **No data**. It is not 0% or 100% uptime.
- These are sample-based percentages, not exact downtime durations, and do not imply incident or severity parity with Statuspage. Today may be incomplete. Values near 0% or 100% use `<0.01%` or `>99.99%` rather than rounding a partial day to an endpoint.
- Use the day selector for keyboard or touch access to every date. Hovering over the bar previews a day with a mouse.

## Data and refresh

`GET /api/status-page/:slug/uptime/daily` returns `dailyUptimeList`, keyed by the IDs of monitors in public groups on that status page. Each entry has 90 `{ timestamp, uptime }` pairs: UTC-midnight Unix seconds and a ratio from 0 to 1, or `null` for no data. An unknown slug returns 404. The endpoint uses the existing one-minute response cache and aggregate history; it does not return heartbeat messages or monitor metadata.

Daily history is fetched separately from live heartbeats on initial load and at the page's refresh interval. If it fails, the page reports that history is unavailable and retries on the next refresh; live status polling continues independently.
