import { randomInt } from 'node:crypto';

// 去掉容易混淆的字符（0/O、1/I/L）
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return s;
}
