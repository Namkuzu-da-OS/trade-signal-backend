/**
 * Retry Utility for External API Calls
 * Implements exponential backoff for transient failures
 */

import logger from './logger.js';

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} retries - Maximum number of retries (default: 3)
 * @param {number} baseDelay - Base delay in ms (default: 1000)
 * @param {string} context - Context for logging (optional)
 * @returns {Promise} Result of the function
 */
export async function retryAsync(fn, retries = 3, baseDelay = 1000, context = 'Operation') {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const isLastAttempt = attempt === retries - 1;

            if (isLastAttempt) {
                logger.error(`${context} failed after ${retries} attempts:`, error.message);
                throw error;
            }

            const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
            logger.warn(`${context} failed (attempt ${attempt + 1}/${retries}). Retrying in ${delay}ms...`, error.message);

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

export default retryAsync;
