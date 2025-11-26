import logger from '../utils/logger.js';

export function validateSymbol(req, res, next) {
    const symbol = req.query.symbol || req.body.symbol || req.params.symbol;

    if (!symbol) {
        return res.status(400).json({
            error: 'Symbol is required',
            message: 'Please provide a valid stock symbol (e.g., SPY, AAPL, NVDA)',
            field: 'symbol'
        });
    }

    // Match 1-12 uppercase letters/numbers/hyphens, allow dot for special cases (e.g., BRK.B, BTC-USD)
    if (!/^[A-Z0-9-]{1,12}(\.[A-Z]{1,2})?$/.test(symbol.toUpperCase())) {
        return res.status(400).json({
            error: 'Invalid symbol format',
            message: `"${symbol}" is not a valid ticker symbol. Symbols must be 1-12 characters (e.g., SPY, BTC-USD).`,
            field: 'symbol'
        });
    }

    // Normalize to uppercase
    const upperSymbol = symbol.toUpperCase();
    if (req.query.symbol) req.query.symbol = upperSymbol;
    if (req.body.symbol) req.body.symbol = upperSymbol;
    if (req.params.symbol) req.params.symbol = upperSymbol;
    req.validatedSymbol = upperSymbol;

    next();
}

export function validateInterval(req, res, next) {
    const interval = req.query.interval || '1d';
    const validIntervals = ['1m', '2m', '5m', '15m', '30m', '60m', '1h', '1d', '5d', '1wk', '1mo'];

    if (!validIntervals.includes(interval)) {
        return res.status(400).json({
            error: 'Invalid interval',
            message: `Interval must be one of: ${validIntervals.join(', ')}`,
            received: interval,
            field: 'interval'
        });
    }

    req.validatedInterval = interval;
    next();
}

/**
 * Validate automation interval (1-60 minutes)
 */
export function validateAutomationInterval(req, res, next) {
    let intervalMinutes = parseInt(req.body.intervalMinutes);

    if (isNaN(intervalMinutes)) {
        intervalMinutes = 15; // Default
    }

    if (intervalMinutes < 1 || intervalMinutes > 60) {
        return res.status(400).json({
            error: 'Interval must be between 1 and 60 minutes',
            provided: intervalMinutes,
            field: 'intervalMinutes'
        });
    }

    req.validatedIntervalMinutes = intervalMinutes;
    next();
}

/**
 * Validate batch scan request
 */
export function validateBatchScan(req, res, next) {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
        return res.status(400).json({
            error: 'Symbols must be an array',
            field: 'symbols'
        });
    }

    if (symbols.length === 0) {
        return res.status(400).json({
            error: 'At least one symbol is required',
            field: 'symbols'
        });
    }

    if (symbols.length > 20) {
        return res.status(400).json({
            error: 'Maximum 20 symbols per batch request',
            provided: symbols.length,
            field: 'symbols'
        });
    }

    // Validate each symbol
    const validatedSymbols = [];
    for (const symbol of symbols) {
        const upperSymbol = symbol.toUpperCase();
        if (!/^[A-Z0-9-]{1,12}(\.[A-Z]{1,2})?$/.test(upperSymbol)) {
            return res.status(400).json({
                error: 'Invalid symbol in batch',
                invalidSymbol: symbol,
                field: 'symbols'
            });
        }
        validatedSymbols.push(upperSymbol);
    }

    req.validatedSymbols = validatedSymbols;
    next();
}

export default {
    validateSymbol,
    validateInterval,
    validateAutomationInterval,
    validateBatchScan
};
