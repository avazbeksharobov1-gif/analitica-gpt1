const crypto = require('crypto');

const RAW_KEY = process.env.ENCRYPTION_KEY || 'dev-encryption-key';
const KEY = crypto.createHash('sha256').update(RAW_KEY).digest();

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(payload) {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) return payload;
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
