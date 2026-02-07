const PLANS = {
  FREE: { code: 'FREE', name: 'Free', price: 50000, projectLimit: 1 },
  PRO: { code: 'PRO', name: 'Pro', price: 100000, projectLimit: 2 },
  BUSINESS: { code: 'BUSINESS', name: 'Business', price: 150000, projectLimit: 5 }
};

function getPlan(code) {
  return PLANS[code] || PLANS.FREE;
}

module.exports = { PLANS, getPlan };
