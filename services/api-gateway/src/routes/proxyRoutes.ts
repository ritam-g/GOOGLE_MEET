import { Router } from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { AUTH_SERVICE_URL, USER_SERVICE_URL, ROOM_SERVICE_URL } from '../config/env.js';

const router = Router();

router.use(createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathFilter: '/auth',
  pathRewrite: { '^/auth': '/api/v1/auth' },
  on: { proxyReq: fixRequestBody },
}));

router.use(createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathFilter: '/users',
  pathRewrite: { '^/users': '' },
  on: { proxyReq: fixRequestBody },
}));

router.use(createProxyMiddleware({
  target: ROOM_SERVICE_URL,
  changeOrigin: true,
  pathFilter: '/rooms',
  pathRewrite: { '^/rooms': '/v1/rooms' },
  on: { proxyReq: fixRequestBody },
}));

export default router;