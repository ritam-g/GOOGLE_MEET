import express, { Request, Response } from 'express';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser'
import { errorHandler } from './middleware/errorHandler';
import logger from './utils/logger.js';

const app = express();

app.use(express.json());
app.use(cookieParser())
app.use(pinoHttp({ logger }));
/**  
 * * @description Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

/**
 * @description Global error handler
 */
app.use(errorHandler)

export default app;