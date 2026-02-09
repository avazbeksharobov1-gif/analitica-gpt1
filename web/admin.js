const path = require('path');
const { authOptional } = require('../services/auth');

const AUTH_ENABLED = process.env.ENABLE_AUTH === 'true';

module.exports = (app) => {
  app.get('/admin', authOptional, async (req, res) => {
    if (AUTH_ENABLED && (!req.user || req.user.role !== 'ADMIN')) {
      return res.status(403).send('Forbidden');
    }
    res.sendFile(path.join(__dirname, 'admin.html'));
  });
};
