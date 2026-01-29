const axios = require('axios');

async function getStats() {
  return {
    revenue: 1250000,
    orders: 37,
    ads: 210000
  };
}

module.exports = { getStats };
