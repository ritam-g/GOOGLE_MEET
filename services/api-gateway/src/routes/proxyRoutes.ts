import { Router } from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { gatewayAuth } from '../middleware/gatewayAuth.js';
import { AUTH_SERVICE_URL, USER_SERVICE_URL, ROOM_SERVICE_URL } from '../config/env.js';

const router = Router();

// Public — no auth required (signup, login, refresh)
router.use(createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathFilter: ['/auth/signup', '/auth/login', '/auth/refresh'],
  pathRewrite: { '^/auth': '/api/v1/auth' },
  on: { proxyReq: fixRequestBody },
}));

// Protected — requires a valid token at the Gateway
router.use(
  ['/auth/logout', '/auth/me'],
  gatewayAuth,
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/auth': '/api/v1/auth' },
    on: { proxyReq: fixRequestBody },
  })
);

// User Service — entirely protected
router.use(
  '/users',
  gatewayAuth,
  createProxyMiddleware({
    target: USER_SERVICE_URL,
    changeOrigin: true,
    pathFilter: '/users',
    pathRewrite: { '^/users': '' },
    on: { proxyReq: fixRequestBody },
  })
);

// Room Service — entirely protected
router.use(
  '/rooms',
  gatewayAuth,
  createProxyMiddleware({
    target: ROOM_SERVICE_URL,
    changeOrigin: true,
    pathFilter: '/rooms',
    pathRewrite: { '^/rooms': '/v1/rooms' },
    on: { proxyReq: fixRequestBody },
  })
);

export default router;