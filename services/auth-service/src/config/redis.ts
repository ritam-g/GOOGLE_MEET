import Redis from 'ioredis';
import { REDIS_URL } from "./env"
import logger from '../utils/logger';
import AppError from '../utils/AppError';

const redis = new Redis(REDIS_URL);

redis.on('connect', () => {
    logger.info('Redis connected successfully');
})

redis.on('error', (err: any) => {
    logger.error('Redis connection error:', err);
});

/**  
 * Publishes an event to a specified Redis channel.
 * @param {string} channel - The Redis channel to publish the event to.
 * @param {string} data - The data to be published as a string.
 * @throws {AppError} Throws an AppError if publishing fails.
 * @description This function uses the Redis client to publish a message to a specified channel. It logs the success or failure of the operation and throws an AppError in case of failure, providing a clear error message and status code.
 */
export const publishEvent = async (channel: string, data: string) => {
    try {
        await redis.publish(channel, data);
        logger.info(`Event published to channel ${channel}: ${data}`);
    } catch (err: any) {
        logger.error(`Failed to publish event to channel ${channel}:`, err);
        throw new AppError(`Failed to publish event to channel ${channel}: ${err.message}`, 500);
    }
}

export default redis;