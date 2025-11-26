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

export async function generateAISentiment(symbol, indicators, strategy, marketState, setup) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return { combined_analysis: 'AI sentiment unavailable (API key not configured)' };
        }

        const prompt = `You are a professional trading analyst. Analyze this setup concisely:

Symbol: ${symbol}
Strategy: ${strategy.name} (Score: ${strategy.score}%)
Signal: ${strategy.signal}
Price: $${marketState.price.toFixed(2)}
RSI: ${indicators.rsi.toFixed(1)} | ADX: ${indicators.adx.toFixed(1)} | VIX: ${marketState.vix.toFixed(2)}
Setup: Entry $${setup?.entryZone?.toFixed(2) || 'N/A'}, Stop $${setup?.stopLoss?.toFixed(2) || 'N/A'}, Target $${setup?.target?.toFixed(2) || 'N/A'}
GEX: $${marketState.gex.toFixed(2)}B (${marketState.gex > 0 ? 'Positive - Market Makers dampen volatility' : 'Negative - Market Makers amplify volatility'})
Kelly Sizing: ${setup?.kellyRecommendation?.percentage || 20}%

Provide a 2-3 sentence analysis:
1. What makes this setup compelling or risky
2. Key factors to watch
3. Brief market regime context

Be concise, professional, and educational. Use **bold** for emphasis.`;

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
