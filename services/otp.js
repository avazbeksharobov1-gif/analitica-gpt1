const bcrypt = require('bcryptjs');
const { prisma } = require('./db');
const { sendSms } = require('./sms');

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function requestOtp(phone, userId = null) {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.otp.create({
    data: { phone, codeHash, expiresAt, userId: userId || undefined }
  });

  await sendSms(phone, `Analitica код: ${code}`);
  return { ok: true };
}

async function verifyOtp(phone, code) {
  const now = new Date();
  const otp = await prisma.otp.findFirst({
    where: { phone, usedAt: null, expiresAt: { gte: now } },
    orderBy: { id: 'desc' }
  });
  if (!otp) return false;
  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) return false;
  await prisma.otp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  return true;
}

module.exports = { requestOtp, verifyOtp };
