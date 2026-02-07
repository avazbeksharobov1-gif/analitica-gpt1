const path = require('path');
const { authOptional } = require('../services/auth');

const AUTH_ENABLED = process.env.ENABLE_AUTH === 'true';

module.exports = (app) => {
  app.get('/login', authOptional, (req, res) => {
    if (AUTH_ENABLED && req.user) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'login.html'));
  });

  app.get('/register', authOptional, (req, res) => {
    if (AUTH_ENABLED && req.user) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'register.html'));
  });
};
