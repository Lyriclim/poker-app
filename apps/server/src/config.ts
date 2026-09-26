import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  // 注册邀请码：为空表示开放注册；设置后只有提供正确邀请码的人才能注册
  registerCode: process.env.REGISTER_CODE ?? '',
};
