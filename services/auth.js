const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const TOKEN_TTL = process.env.JWT_TTL || '7d';

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function getTokenFromReq(req) {
  if (req.cookies && req.cookies.auth) return req.cookies.auth;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function authRequired(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    req.user = verifyToken(token);
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
}

function authOptional(req, _res, next) {
  try {
    const token = getTokenFromReq(req);
    if (token) req.user = verifyToken(token);
  } catch (e) {
    // ignore
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  authRequired,
  authOptional
};
