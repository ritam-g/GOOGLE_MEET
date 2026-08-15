import express, { Request, Response } from 'express';
import { errorHandler } from './middleware/errorHandler';

const app = express();
app.use(express.json());

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