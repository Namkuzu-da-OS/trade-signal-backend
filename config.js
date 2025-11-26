// ============================================================================
// CENTRALIZED CONFIGURATION
// ============================================================================
// All strategy thresholds, magic numbers, and configurable parameters

export const CONFIG = {
    // ====================
    // STRATEGY THRESHOLDS
    // ====================

    // RSI Thresholds
    RSI_OVERSOLD: 30,
    RSI_OVERBOUGHT: 70,
    RSI_HEALTHY_MIN: 40,
    RSI_HEALTHY_MAX: 60,
    RSI_BULLISH_MIN: 50,
    RSI_BULLISH_MAX: 70,

    // Volume Confirmation
    VOLUME_CONFIRMATION: 1.5,
    VOLUME_SURGE: 2.0,
    VOLUME_SPIKE: 1.5,

    // VWAP Proximity
    VWAP_PROXIMITY_THRESHOLD: 0.005,  // 0.5% for VWAP Bounce
    VWAP_PROXIMITY_GOLDEN: 0.008,     // 0.8% for Golden Setup
    VWAP_DEVIATION_THRESHOLD: 0.02,   // 2% for Mean Reversion

    // Bollinger Bands
    BB_SQUEEZE_THRESHOLD: 0.10,       // 10% width for squeeze
    BB_PERIOD: 20,
    BB_STD_DEV: 2,

    // ADX Thresholds
    ADX_ENERGY_THRESHOLD: 20,
    ADX_STRONG_THRESHOLD: 25,

    // VIX Levels
    VIX_LOW_VOLATILITY: 15,
    VIX_NORMAL: 20,
    VIX_ELEVATED: 30,
    VIX_HIGH_FEAR: 25,

    // Opening Range Breakout
    ORB_RANGE_MIN_PERCENT: 0.002,     // 0.2% minimum range quality
    ORB_VOLUME_CONFIRMATION: 1.2,

    // GEX (Gamma Exposure)
    GEX_SIGNIFICANT_THRESHOLD: 1,     // $1B for significant exposure

    // ====================
    // RISK MANAGEMENT
    // ====================

    // Default Risk Parameters
    DEFAULT_RISK_PER_TRADE: 0.01,     // 1% of account
    DEFAULT_ACCOUNT_SIZE: 100000,     // $100k
    MAX_KELLY_ALLOCATION: 0.20,       // 20% max position size
    KELLY_MULTIPLIER: 0.5,            // Half-Kelly for safety

    // Risk/Reward Ratios
    DEFAULT_RISK_REWARD: 2.0,
    BREAKOUT_RISK_REWARD: 2.5,
    MEAN_REVERSION_RR: 1.5,

    // ATR-based Risk
    ATR_RISK_MULTIPLIER: 2.0,
    ATR_PERIOD: 14,

    // ====================
    // DATA FETCHING
    // ====================

    // Lookback Periods
    LOOKBACK_INTRADAY_15M: 5,         // 5 days for 15m data
    LOOKBACK_INTRADAY_1H: 30,         // 30 days for 1h data
    LOOKBACK_DAILY: 365,              // 1 year for daily data
    LOOKBACK_WEEKLY: 730,             // 2 years for weekly data

    // Indicator Periods
    SMA_20_PERIOD: 20,
    SMA_50_PERIOD: 50,
    SMA_200_PERIOD: 200,
    EMA_8_PERIOD: 8,
    EMA_21_PERIOD: 21,
    EMA_55_PERIOD: 55,
    RSI_PERIOD: 14,
    STOCHASTIC_PERIOD: 14,
    STOCHASTIC_SIGNAL_PERIOD: 3,

    // Volume Profile
    VOLUME_PROFILE_PERIOD: 50,        // 50 days
    VOLUME_PROFILE_BUCKETS: 24,

    // ====================
    // AUTOMATION
    // ====================

    // AutoTrader Settings
    AUTO_SCAN_INTERVAL: 15,           // Minutes between scans
    AUTO_SIGNAL_THRESHOLD: 80,        // Minimum score for auto-trading
    AUTO_MAX_CONCURRENT: 10,          // Max concurrent symbol processing

    // Alert Settings
    ALERT_SCORE_THRESHOLD: 80,        // Minimum score to log alert

    // ====================
    // API SETTINGS
    // ====================

    // Server
    DEFAULT_PORT: 3001,
    LOCAL_API_URL: process.env.LOCAL_API_URL || 'http://localhost:3001',

    // Rate Limiting
    YAHOO_FINANCE_MAX_CONCURRENT: 10,
    YAHOO_FINANCE_RETRY_ATTEMPTS: 3,
    YAHOO_FINANCE_RETRY_DELAY: 1000,  // ms

    // Cache TTL (if implemented)
    CACHE_TTL_MARKET_DATA: 300,       // 5 minutes in seconds
    CACHE_TTL_OPTIONS: 600,           // 10 minutes

    // AI Sentiment
    GEMINI_TEMPERATURE: 0.7,
    GEMINI_MAX_OUTPUT_TOKENS: 300,
    GEMINI_MODEL: 'gemini-2.0-flash',

    // ====================
    // SCORING
    // ====================

    // Score Ranges
    SCORE_STRONG_BUY: 90,
    SCORE_BUY: 67,
    SCORE_WATCH: 34,
    SCORE_NEUTRAL: 0,

    // Golden Setup Thresholds
    GOLDEN_SETUP_MIN_SCORE: 80,
    GOLDEN_SETUP_WATCH_SCORE: 50,

    // ====================
    // DATABASE
    // ====================

    DB_PATH: './database.sqlite',

    // ====================
    // ENVIRONMENT OVERRIDES
    // ====================
    // Allow environment variables to override defaults
    // Example: STRATEGY_RSI_MIN=45 STRATEGY_VOL_CONFIRM=2.0

    // Helper to get config with env override
    get(key, envKey) {
        return process.env[envKey] || this[key];
    }
};

// Export individual constants for convenience
export const {
    RSI_OVERSOLD,
    RSI_OVERBOUGHT,
    RSI_HEALTHY_MIN,
    RSI_HEALTHY_MAX,
    VOLUME_CONFIRMATION,
    VWAP_PROXIMITY_THRESHOLD,
    BB_SQUEEZE_THRESHOLD,
    ADX_ENERGY_THRESHOLD,
    VIX_HIGH_FEAR,
    DEFAULT_RISK_REWARD,
    SCORE_STRONG_BUY,
    SCORE_BUY,
    SCORE_WATCH
} = CONFIG;

export default CONFIG;
