import { calculateKeyLevels } from './analysis.js';
import yahooFinance from 'yahoo-finance2';

async function testKeyLevels() {
    const symbol = 'SPY';
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 1);

    console.log(`Fetching data for ${symbol}...`);
    const result = await yahooFinance.chart(symbol, {
        period1: startDate.toISOString().split('T')[0],
        interval: '1d'
    });

    const historical = result.quotes.map(q => ({
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume
    })).filter(q => q.close !== null);

    console.log(`Fetched ${historical.length} candles.`);

    const levels = calculateKeyLevels(historical);

    const last = historical[historical.length - 1];
    console.log(`Current Price (approx): ${last.close}`);
    console.log('Calculated Levels:', JSON.stringify(levels, null, 2));
}

testKeyLevels();
