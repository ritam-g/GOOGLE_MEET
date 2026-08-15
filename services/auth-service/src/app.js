import express from 'express';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

export default app;