import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
};
