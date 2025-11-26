import axios from 'axios';
import CONFIG from '../config.js';
import logger from '../utils/logger.js';

export class NotificationService {
    constructor() {
        this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    }

    /**
     * Send a trade alert to Discord
     * @param {Object} alertData 
     */
    async sendTradeAlert(alertData) {
        if (!this.discordWebhookUrl) {
            logger.warn('Discord Webhook URL not set. Skipping alert.');
            return;
        }

        const { symbol, signal, score, strategy, price, stopLoss, target, aiAnalysis } = alertData;

        const color = signal === 'STRONG BUY' || signal === 'BUY' ? 0x10b981 : 0xf43f5e; // Emerald or Rose

        const embed = {
            title: `${signal === 'STRONG BUY' ? '🚀' : '📉'} ${signal}: ${symbol}`,
            description: strategy,
            color: color,
            fields: [
                { name: 'Score', value: `${score}%`, inline: true },
                { name: 'Price', value: `$${price.toFixed(2)}`, inline: true },
                { name: 'Target', value: `$${target?.toFixed(2) || 'N/A'}`, inline: true },
                { name: 'Stop Loss', value: `$${stopLoss?.toFixed(2) || 'N/A'}`, inline: true },
                { name: 'AI Insight', value: aiAnalysis || 'No analysis available' }
            ],
            footer: {
                text: `TradeSignal AI • ${new Date().toLocaleTimeString()}`
            }
        };

        try {
            await axios.post(this.discordWebhookUrl, {
                username: 'TradeSignal Bot',
                avatar_url: 'https://i.imgur.com/4M34hi2.png',
                embeds: [embed]
            });
            logger.info(`Sent Discord alert for ${symbol}`);
        } catch (error) {
            logger.error('Failed to send Discord alert:', error.message);
        }
    }
}

export const notificationService = new NotificationService();
