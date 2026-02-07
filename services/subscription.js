const { prisma } = require('./db');
const { getPlan } = require('./plans');

async function getActiveSubscription(userId) {
  const now = new Date();
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'TRIAL'] },
      currentPeriodEnd: { gte: now }
    },
    orderBy: { id: 'desc' }
  });
}

async function getUserPlan(userId) {
  const sub = await getActiveSubscription(userId);
  if (!sub) return { plan: getPlan('FREE'), subscription: null };
  return { plan: getPlan(sub.plan), subscription: sub };
}

async function setUserPlan(userId, planCode, days = 30) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  const plan = getPlan(planCode);

  return prisma.subscription.create({
    data: {
      userId,
      plan: plan.code,
      status: 'ACTIVE',
      price: plan.price,
      currentPeriodStart: now,
      currentPeriodEnd: end
    }
  });
}

module.exports = { getUserPlan, getActiveSubscription, setUserPlan };
