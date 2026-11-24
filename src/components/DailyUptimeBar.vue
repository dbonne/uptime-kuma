<template>
    <div class="daily-uptime" data-testid="daily-uptime">
        <div class="daily-header">
            <strong>{{ $t("dailyUptimeHeading") }}</strong>
            <span>{{ $t("dailyUptimeSampleNote") }}</span>
        </div>

        <template v-if="status === 'ready' && days.length">
            <div
                class="daily-bars"
                aria-hidden="true"
                data-testid="daily-uptime-bars"
                @mousemove="hoverDay"
                @mouseleave="hoveredIndex = null"
                @click="selectHoveredDay"
            >
                <span
                    v-for="(day, index) in days"
                    :key="day.timestamp"
                    class="day"
                    :class="[dailyUptimeClass(day.uptime), { selected: index === activeIndex }]"
                    data-testid="daily-uptime-day"
                ></span>
            </div>
            <div class="daily-ends" aria-hidden="true">
                <span>{{ formatDailyDate(days[0].timestamp) }}</span>
                <span>{{ formatDailyDate(days[days.length - 1].timestamp) }}</span>
            </div>
            <p class="daily-detail" data-testid="daily-uptime-detail">{{ dayLabel(days[activeIndex]) }}</p>
            <label :for="controlId" class="daily-label">{{ $t("dailyUptimeSelect") }}</label>
            <select
                :id="controlId"
                v-model.number="selectedIndex"
                class="form-select form-select-sm"
                :aria-label="$t('dailyUptimeSelectFor', { monitor: monitorName })"
                data-testid="daily-uptime-select"
            >
                <option v-for="(day, index) in days" :key="day.timestamp" :value="index">
                    {{ dayLabel(day) }}
                </option>
            </select>
        </template>
        <p v-else-if="status === 'loading'" class="daily-message">{{ $t("dailyUptimeLoading") }}</p>
        <p v-else-if="status === 'error'" class="daily-message">{{ $t("dailyUptimeBriefError") }}</p>
        <p v-else class="daily-message">{{ $t("dailyUptimeUnavailable") }}</p>
    </div>
</template>

<script>
import { useId } from "vue";
import { dailyUptimeClass, formatDailyDate, formatDailyUptime } from "../util/daily-uptime";

export default {
    props: {
        days: {
            type: Array,
            default: () => [],
        },
        status: {
            type: String,
            required: true,
        },
        monitorName: {
            type: String,
            required: true,
        },
    },
    setup() {
        return { controlId: useId() };
    },
    data() {
        return { selectedIndex: 89, hoveredIndex: null };
    },
    computed: {
        activeIndex() {
            return Math.min(this.hoveredIndex ?? this.selectedIndex, this.days.length - 1);
        },
    },
    methods: {
        dailyUptimeClass,
        formatDailyDate,
        /**
         * Describe one UTC day using only the sample-based percentage.
         * @param {object} day Daily uptime record
         * @returns {string} Localized date and uptime
         */
        dayLabel(day) {
            const date = formatDailyDate(day.timestamp);
            const value = formatDailyUptime(day.uptime);
            return value === null
                ? this.$t("dailyUptimeNoData", { date })
                : this.$t("dailyUptimeValue", { date, value });
        },
        /**
         * Preview a day under the pointer; the select provides a larger touch target.
         * @param {MouseEvent} event Pointer position
         * @returns {void}
         */
        hoverDay(event) {
            const rect = event.currentTarget.getBoundingClientRect();
            this.hoveredIndex = Math.max(0, Math.min(this.days.length - 1,
                Math.floor((event.clientX - rect.left) / rect.width * this.days.length)));
        },
        /** @returns {void} */
        selectHoveredDay() {
            if (this.hoveredIndex !== null) {
                this.selectedIndex = this.hoveredIndex;
            }
        },
    },
};
</script>

<style lang="scss" scoped>
.daily-uptime {
    min-width: 0;
    margin: 0.35rem 0;
}

.daily-header,
.daily-ends {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0 0.5rem;
}

.daily-header {
    font-size: 0.8rem;
}

.daily-header span,
.daily-ends,
.daily-message {
    color: #626b73;

    .dark & {
        color: #b1b8c0;
    }
}

.daily-bars {
    display: flex;
    gap: 1px;
    width: 100%;
    height: 26px;
    margin-top: 0.45rem;
    cursor: crosshair;
}

.day {
    flex: 1 1 0;
    min-width: 0;
    border-radius: 2px;
    background: #949da5;

    &.up { background: #39b86f; }
    &.partial { background: #e99b20; }
    &.down { background: #d9505e; }
    &.selected { outline: 1px solid currentcolor; }
}

.daily-ends,
.daily-label {
    font-size: 0.75rem;
}

.daily-detail {
    margin: 0.25rem 0;
    font-size: 0.85rem;
    font-weight: 600;
}

.daily-message {
    margin: 0.4rem 0 0;
    font-size: 0.85rem;
}

.daily-label {
    display: block;
}

select {
    min-height: 44px;
    max-width: 100%;
}
</style>
