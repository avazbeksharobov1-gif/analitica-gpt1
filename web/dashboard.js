const path = require('path');

module.exports = (app) => {
  app.get('/dashboard', async (_, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
  });
};
