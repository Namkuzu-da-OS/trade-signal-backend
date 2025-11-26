import { GoogleGenerativeAI } from '@google/generative-ai';
import CONFIG from '../config.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({
    model: CONFIG.GEMINI_MODEL,
    generationConfig: {
        temperature: CONFIG.GEMINI_TEMPERATURE,
        maxOutputTokens: CONFIG.GEMINI_MAX_OUTPUT_TOKENS,
    }
});

export async function generateAISentiment(symbol, indicators, strategy, marketState, setup, timeframeSignals = null) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return { combined_analysis: 'AI sentiment unavailable (API key not configured)' };
        }

        // Calculate alignment if timeframe signals provided
        const alignment = timeframeSignals ?
            [timeframeSignals.tf15m, timeframeSignals.tf1h, timeframeSignals.tf1d].filter(s => s === strategy.signal).length : 0;

        const alignmentText = timeframeSignals ?
            `${alignment}/3 timeframes aligned (15m: ${timeframeSignals.tf15m}, 1H: ${timeframeSignals.tf1h}, 1D: ${timeframeSignals.tf1d})` :
            'Single timeframe';

        // Calculate R:R ratio
        const riskReward = setup?.entryZone && setup?.stopLoss && setup?.target ?
            Math.abs((setup.target - setup.entryZone) / (setup.entryZone - setup.stopLoss)).toFixed(2) : 'N/A';

        const prompt = `You are a professional trading analyst. Analyze this setup and provide structured, actionable insights:

**SETUP DATA:**
Symbol: ${symbol}
Strategy: ${strategy.name} (Score: ${strategy.score}%)
Signal: ${strategy.signal}
Timeframe Alignment: ${alignmentText}
Current Price: $${marketState.price.toFixed(2)}
Technical: RSI ${indicators.rsi.toFixed(1)} | ADX ${indicators.adx.toFixed(1)} | RVOL ${indicators.rvol?.toFixed(2) || 'N/A'}x
Market: VIX ${marketState.vix.toFixed(2)} | GEX $${marketState.gex.toFixed(2)}B
Trade: Entry $${setup?.entryZone?.toFixed(2) || 'N/A'} | Stop $${setup?.stopLoss?.toFixed(2) || 'N/A'} | Target $${setup?.target?.toFixed(2) || 'N/A'}
Risk:Reward: ${riskReward}:1

**REQUIRED FORMAT** (use exactly these section headers):

[RISK] 
One sentence: What is the primary risk with this setup?

[EDGE]
One sentence: What gives this setup an edge? ${alignment >= 2 ? 'Mention the timeframe confluence.' : ''}

[WATCH]
One sentence: What specific price action or indicator would confirm/invalidate this setup?

[CONTEXT]
One sentence: How does current market regime (VIX/GEX) affect this trade?

Be direct, specific, and educational. Use **bold** for key levels and terms. Keep total response under 100 words.`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        return { combined_analysis: text };
    } catch (error) {
        console.warn('Gemini API Error:', error.message);
        if (error.message.includes('API_KEY_INVALID')) {
            return { combined_analysis: 'AI sentiment unavailable. Please set a valid **GEMINI_API_KEY** in your .env file. Get one at https://makersuite.google.com/app/apikey' };
        }
        return { combined_analysis: 'AI sentiment temporarily unavailable' };
    }
}
