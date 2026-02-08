const { prisma } = require('./db');
const {
  fetchOrdersByDate,
  fetchReturnsByDate,
  fetchPayoutsByDate,
  getCampaignIds,
  getApiKeys
} = require('./yandexSeller');
const { getSellerConfig } = require('./projectTokens');
const ACQUIRING_RATE = Number(process.env.ACQUIRING_RATE || 0.01);
const SKIP_PAYOUTS = process.env.SKIP_PAYOUTS === 'true';

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function sumMoney(items, field) {
  return items.reduce((s, it) => s + (Number(it[field]) || 0), 0);
}

function pickNumber(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      const n = Number(obj[k]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function sumCommissions(list) {
  const out = { fees: 0, acquiring: 0, logistics: 0 };
  if (!Array.isArray(list)) return out;

  for (const c of list) {
    const type = String(c?.type || c?.service || c?.name || '').toUpperCase();
    const amount =
      Number(c?.actual) ||
      Number(c?.amount) ||
      Number(c?.value) ||
      0;
    if (!amount) continue;

    if (['FEE', 'LOYALTY_PARTICIPATION_FEE', 'AUCTION_PROMOTION', 'INSTALLMENT'].includes(type)) {
      out.fees += amount;
      continue;
    }
    if (['AGENCY', 'AGENCY_COMMISSION', 'PAYMENT_TRANSFER'].includes(type)) {
      out.acquiring += amount;
      continue;
    }
    if (
      [
        'DELIVERY_TO_CUSTOMER',
        'EXPRESS_DELIVERY_TO_CUSTOMER',
        'RETURNED_ORDERS_STORAGE',
        'SORTING',
        'INTAKE_SORTING',
        'RETURN_PROCESSING',
        'FULFILLMENT',
        'MIDDLE_MILE',
        'CROSSREGIONAL_DELIVERY',
        'DELIVERY',
        'EXPRESS_DELIVERY',
        'LOGISTICS'
      ].includes(type)
    ) {
      out.logistics += amount;
      continue;
    }

    // Unknown commission type -> keep under fees to not lose costs
    out.fees += amount;
  }

  return out;
}

function getItemRevenue(it) {
  const qty = Number(it.count || it.quantity || 0) || 0;
  if (Array.isArray(it.prices) && it.prices.length) {
    const buyer = it.prices.find((p) => String(p.type).toUpperCase() === 'BUYER') || it.prices[0];
    const total = Number(buyer?.total) || 0;
    if (total) return total;
    const per = Number(buyer?.costPerItem || buyer?.price) || 0;
    return per * qty;
  }
  const price = Number(it.price || it.priceWithDiscount || it.buyerPrice || 0);
  return price * qty;
}

function sumByKeys(items, keys) {
  return items.reduce((sum, it) => sum + pickNumber(it, keys), 0);
}

async function syncDay(projectId, date) {
  const day = toDateOnly(date);
  const dateStr = day.toISOString().slice(0, 10);

  const errors = {};

  const config = await getSellerConfig(projectId);
  const campaignIds = config?.campaignIds?.length ? config.campaignIds : getCampaignIds();
  const apiKeys = config?.apiKeys?.length ? config.apiKeys : getApiKeys();
  const tokenMap = config?.tokenMap?.length ? config.tokenMap : [];
  const requestOptions = {
    baseUrl: config?.baseUrl,
    authMode: config?.authMode
  };
  if (!campaignIds.length) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  if (!apiKeys.length) {
    throw new Error('YANDEX_SELLER_API_KEY missing');
  }

  const orders = [];
  const returns = [];
  const payouts = [];

  const pairs = [];
  if (tokenMap.length) {
    for (const entry of tokenMap) {
      const key = entry.key;
      if (!key) continue;
      const camps = entry.campaignIds && entry.campaignIds.length ? entry.campaignIds : campaignIds;
      for (const campaignId of camps) {
        pairs.push({ campaignId, apiKey: key });
      }
    }
  } else {
    for (const apiKey of apiKeys) {
      for (const campaignId of campaignIds) {
        pairs.push({ campaignId, apiKey });
      }
    }
  }

  for (const { apiKey, campaignId } of pairs) {
    const [ordersData, returnsData, payoutsData] = await Promise.all([
      fetchOrdersByDate(dateStr, dateStr, campaignId, apiKey, requestOptions).catch((e) => {
        errors[`${campaignId}:orders`] = e.message || String(e);
        console.error('Yandex orders error:', e.message);
        return { orders: [] };
      }),
      fetchReturnsByDate(dateStr, dateStr, campaignId, apiKey, requestOptions).catch((e) => {
        errors[`${campaignId}:returns`] = e.message || String(e);
        console.error('Yandex returns error:', e.message);
        return { returns: [] };
      }),
      SKIP_PAYOUTS
        ? Promise.resolve({ payouts: [] })
        : fetchPayoutsByDate(dateStr, dateStr, campaignId, apiKey, requestOptions).catch((e) => {
            const msg = e.message || String(e);
            if (!msg.includes('404') && !msg.includes('NOT_FOUND')) {
              errors[`${campaignId}:payouts`] = msg;
              console.error('Yandex payouts error:', msg);
            } else {
              console.warn('Yandex payouts not available, skipping');
            }
            return { payouts: [] };
          })
    ]);

    orders.push(...(ordersData.orders || []));
    returns.push(...(returnsData.returns || []));
    payouts.push(...(payoutsData.payouts || []));
  }

  let revenue = 0;
  let ordersCount = 0;
  let fees = 0;
  let acquiring = 0;
  let logistics = 0;
  let returnsSum = 0;

  const itemAgg = new Map();
  const returnsBySku = new Map();

  const payoutAcquiring = sumByKeys(payouts, [
    'acquiring',
    'acquiringFee',
    'paymentFee',
    'paymentProcessingFee',
    'bankFee',
    'processingFee'
  ]);

  for (const o of orders) {
    ordersCount += 1;
    let orderRevenue =
      pickNumber(o, [
        'total',
        'itemsTotal',
        'buyerItemsTotal',
        'paymentsTotal',
        'price',
        'buyerTotal'
      ]) || 0;

    const commissionSplit = sumCommissions(o.commissions);
    const hasCommissions =
      commissionSplit.fees + commissionSplit.acquiring + commissionSplit.logistics > 0;

    let orderFees = pickNumber(o, ['fee', 'fees', 'marketplaceFee', 'commission']);
    let orderLogistics = pickNumber(o, ['delivery', 'logistics', 'shipping', 'shipment']);
    let orderAcquiring = pickNumber(o, [
      'acquiring',
      'acquiringFee',
      'paymentFee',
      'paymentProcessingFee',
      'bankFee',
      'processingFee'
    ]);

    if (hasCommissions) {
      orderFees = commissionSplit.fees;
      orderLogistics = commissionSplit.logistics;
      orderAcquiring = commissionSplit.acquiring;
    }

    if (!orderAcquiring && ACQUIRING_RATE > 0) {
      orderAcquiring = orderRevenue * ACQUIRING_RATE;
    }

    if ((!orderRevenue || orderRevenue === 0) && Array.isArray(o.items)) {
      orderRevenue = o.items.reduce((sum, it) => sum + getItemRevenue(it), 0);
    }

    revenue += orderRevenue;
    fees += orderFees;
    logistics += orderLogistics;
    acquiring += orderAcquiring;
    if (Array.isArray(o.items)) {
      for (const it of o.items) {
        const sku = String(it.offerId || it.shopSku || it.sku || 'unknown');
        const prev = itemAgg.get(sku) || {
          quantity: 0,
          revenue: 0,
          fees: 0,
          acquiring: 0,
          logistics: 0,
          returns: 0
        };
        const qty = Number(it.count || it.quantity || 0) || 0;
        const itemRevenue = getItemRevenue(it);
        prev.quantity += qty;
        prev.revenue += itemRevenue;

        const itemFees = pickNumber(it, ['fee', 'fees', 'commission', 'marketplaceFee']);
        const itemLogistics = pickNumber(it, ['delivery', 'logistics', 'shipping']);
        const itemAcquiring = pickNumber(it, [
          'acquiring',
          'acquiringFee',
          'paymentFee',
          'paymentProcessingFee'
        ]);

        prev.fees += itemFees || (orderRevenue ? (orderFees * itemRevenue) / orderRevenue : 0);
        prev.logistics += itemLogistics || (orderRevenue ? (orderLogistics * itemRevenue) / orderRevenue : 0);
        prev.acquiring += itemAcquiring || (orderRevenue ? (orderAcquiring * itemRevenue) / orderRevenue : 0);
        itemAgg.set(sku, prev);
      }
    }
  }

  returnsSum = sumMoney(returns, 'amount');

  for (const r of returns) {
    const items = r.items || r.returnItems || [];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const sku = String(it.offerId || it.sku || 'unknown');
      const qty = Number(it.count || it.quantity || 1);
      const amount = Number(it.amount || it.price || it.refund || 0);
      const total = amount * (qty || 1);
      returnsBySku.set(sku, (returnsBySku.get(sku) || 0) + total);
    }
  }

  if (returnsBySku.size) {
    for (const [sku, total] of returnsBySku.entries()) {
      const prev = itemAgg.get(sku) || {
        quantity: 0,
        revenue: 0,
        fees: 0,
        acquiring: 0,
        logistics: 0,
        returns: 0
      };
      prev.returns += total;
      itemAgg.set(sku, prev);
    }
  }

  if (payoutAcquiring > 0) {
    if (acquiring > 0) {
      const k = payoutAcquiring / acquiring;
      for (const it of itemAgg.values()) {
        it.acquiring *= k;
      }
    } else if (revenue > 0) {
      for (const it of itemAgg.values()) {
        it.acquiring = (it.revenue / revenue) * payoutAcquiring;
      }
    }
    acquiring = payoutAcquiring;
  }

  await prisma.sellerDaily.upsert({
    where: { projectId_date: { projectId, date: day } },
    update: { revenue, orders: ordersCount, fees, acquiring, logistics, returns: returnsSum },
    create: { projectId, date: day, revenue, orders: ordersCount, fees, acquiring, logistics, returns: returnsSum }
  });

  await prisma.sellerItemDaily.deleteMany({ where: { projectId, date: day } });

  for (const [sku, v] of itemAgg.entries()) {
    await prisma.sellerItemDaily.create({
      data: {
        projectId,
        date: day,
        sku,
        quantity: v.quantity,
        revenue: v.revenue,
        fees: v.fees,
        acquiring: v.acquiring,
        logistics: v.logistics,
        returns: v.returns
      }
    });
  }

  return { revenue, orders: ordersCount, fees, acquiring, logistics, returns: returnsSum, errors };
}

module.exports = { syncDay };
