const path = require('path');
const { authOptional } = require('../services/auth');

const AUTH_ENABLED = process.env.ENABLE_AUTH === 'true';

module.exports = (app) => {
  app.get('/dashboard', authOptional, async (req, res) => {
    if (AUTH_ENABLED && !req.user) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'dashboard.html'));
  });
};
