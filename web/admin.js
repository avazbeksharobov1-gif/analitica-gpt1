const path = require('path');
const { prisma } = require('../services/db');
const { ensureAdminUser, ensureAdminMemberships } = require('../services/bootstrap');
const { authOptional, hashPassword, signToken } = require('../services/auth');

const AUTH_ENABLED = process.env.ENABLE_AUTH === 'true';
const ADMIN_AUTO_LOGIN = process.env.ADMIN_AUTO_LOGIN === 'true';

function getCookieOptions() {
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.WEBHOOK_URL || '').startsWith('https://') ||
    Boolean(process.env.RAILWAY_PUBLIC_DOMAIN);
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure
  };
}

async function ensureAutoLoginAdmin() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { id: 'asc' }
  });
  if (existingAdmin) return existingAdmin;

  const envAdmin = await ensureAdminUser();
  if (envAdmin) {
    await ensureAdminMemberships(envAdmin);
    return envAdmin;
  }

  const email = String(process.env.ADMIN_AUTO_EMAIL || 'admin@local.dev').trim().toLowerCase();
  const passwordHash = await hashPassword(process.env.ADMIN_AUTO_PASSWORD || 'admin-auto-login');
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', isActive: true, passwordHash },
    create: {
      email,
      passwordHash,
      role: 'ADMIN',
      isActive: true
    }
  });
  await ensureAdminMemberships(user);
  return user;
}

async function getAdminTokenPayload() {
  const admin = await ensureAutoLoginAdmin();
  const membership = await prisma.projectUser.findFirst({
    where: { userId: admin.id },
    orderBy: { id: 'asc' }
  });
  return {
    id: admin.id,
    role: admin.role,
    projectId: membership ? membership.projectId : 1,
    email: admin.email
  };
}

module.exports = (app) => {
  app.get('/admin', authOptional, async (req, res) => {
    if (AUTH_ENABLED && (!req.user || req.user.role !== 'ADMIN')) {
      if (!ADMIN_AUTO_LOGIN) return res.status(403).send('Forbidden');
      try {
        const tokenPayload = await getAdminTokenPayload();
        const token = signToken(tokenPayload);
        res.cookie('auth', token, getCookieOptions());
        return res.redirect('/admin');
      } catch (e) {
        return res.status(500).send(`Admin auto login failed: ${e.message}`);
      }
    }
    res.sendFile(path.join(__dirname, 'admin.html'));
  });
};
