/**
 * Session Service
 * Manages market session phases and time-based logic.
 */

const MARKET_HOURS = {
    PRE_MARKET_START: '04:00',
    OPEN: '09:30',
    LUNCH_START: '12:00',
    LUNCH_END: '13:30',
    POWER_HOUR_START: '15:00',
    CLOSE: '16:00',
    POST_MARKET_END: '20:00'
};

export class SessionService {
    constructor() {
        this.timezone = 'America/New_York';
    }

    /**
     * Get the current market phase based on ET time.
     * @param {Date} [date] - Optional date object (defaults to now)
     * @returns {string} - 'PRE', 'OPENING_DRIVE', 'MORNING', 'LUNCH', 'AFTERNOON', 'POWER_HOUR', 'CLOSE', 'POST', 'CLOSED'
     */
    getSessionPhase(date = new Date()) {
        const etTime = this.getETTime(date);
        const timeStr = this.formatTime(etTime);

        // Weekend check
        const day = etTime.getDay();
        if (day === 0 || day === 6) return 'CLOSED';

        if (timeStr < MARKET_HOURS.PRE_MARKET_START) return 'CLOSED';
        if (timeStr < MARKET_HOURS.OPEN) return 'PRE_MARKET';

        // 9:30 - 10:00: Opening Drive
        if (timeStr >= MARKET_HOURS.OPEN && timeStr < '10:00') return 'OPENING_DRIVE';

        // 10:00 - 12:00: Morning Trend
        if (timeStr >= '10:00' && timeStr < MARKET_HOURS.LUNCH_START) return 'MORNING_TREND';

        // 12:00 - 13:30: Lunch Chop
        if (timeStr >= MARKET_HOURS.LUNCH_START && timeStr < MARKET_HOURS.LUNCH_END) return 'LUNCH_CHOP';

        // 13:30 - 15:00: Afternoon
        if (timeStr >= MARKET_HOURS.LUNCH_END && timeStr < MARKET_HOURS.POWER_HOUR_START) return 'AFTERNOON_SESSION';

        // 15:00 - 16:00: Power Hour
        if (timeStr >= MARKET_HOURS.POWER_HOUR_START && timeStr < MARKET_HOURS.CLOSE) return 'POWER_HOUR';

        if (timeStr >= MARKET_HOURS.CLOSE && timeStr < MARKET_HOURS.POST_MARKET_END) return 'POST_MARKET';

        return 'CLOSED';
    }

    /**
     * Check if market is currently open (Regular Trading Hours)
     */
    isMarketOpen(date = new Date()) {
        const phase = this.getSessionPhase(date);
        return ['OPENING_DRIVE', 'MORNING_TREND', 'LUNCH_CHOP', 'AFTERNOON_SESSION', 'POWER_HOUR'].includes(phase);
    }

    /**
     * Get Opening Range (High/Low of 9:30-10:00 ET)
     * @param {Array} candles - Array of candle objects { date, high, low }
     */
    getOpeningRange(candles) {
        if (!candles || candles.length === 0) return null;

        // Filter candles between 9:30 and 10:00 ET for the current day
        // Assuming candles are sorted by date
        const lastCandle = candles[candles.length - 1];
        const todayStr = this.getETDateString(new Date(lastCandle.date));

        const orCandles = candles.filter(c => {
            const cDate = new Date(c.date);
            const cDateStr = this.getETDateString(cDate);
            if (cDateStr !== todayStr) return false;

            const cTime = this.formatTime(this.getETTime(cDate));
            return cTime >= '09:30' && cTime < '10:00';
        });

        if (orCandles.length === 0) return null;

        let high = -Infinity;
        let low = Infinity;

        orCandles.forEach(c => {
            if (c.high > high) high = c.high;
            if (c.low < low) low = c.low;
        });

        return { high, low, range: high - low };
    }

    // --- Helpers ---

    getETTime(date) {
        return new Date(date.toLocaleString("en-US", { timeZone: this.timezone }));
    }

    getETDateString(date) {
        const et = this.getETTime(date);
        return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
    }

    formatTime(date) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
}

export const sessionService = new SessionService();
