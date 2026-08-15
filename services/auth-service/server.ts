import app from './src/app.js';
import { PORT } from './src/config/env.js';
import logger from './src/utils/logger.js';

app.listen(PORT, () => {
  logger.info(`Auth Service running on port ${PORT}`);
});