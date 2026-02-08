const { prisma } = require('./db');
const {
  fetchOrdersByDate,
  fetchReturnsByDate,
  fetchPayoutsByDate,
  getCampaignIds,
  getApiKeys,
  fetchReturnById
} = require('./yandexSeller');
const { getSellerConfig } = require('./projectTokens');

function parseEnvNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

const ACQUIRING_RATE = parseEnvNumber(process.env.ACQUIRING_RATE, 0.01);
const SKIP_PAYOUTS = process.env.SKIP_PAYOUTS === 'true';
const RETURNS_DEBUG = process.env.RETURNS_DEBUG === 'true';

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
      const n = readMoney(obj[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function readMoney(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof val === 'object') {
    if (val.value !== undefined) return readMoney(val.value);
    if (val.amount !== undefined) return readMoney(val.amount);
    if (val.refundAmount !== undefined) return readMoney(val.refundAmount);
    if (val.totalAmount !== undefined) return readMoney(val.totalAmount);
    if (val.price !== undefined) return readMoney(val.price);
    if (val.sum !== undefined) return readMoney(val.sum);
  }
  return 0;
}

function readMinorMoney(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n / 100 : 0;
}

function extractReturnAmount(r) {
  if (r?.amount !== undefined && r?.amount !== null) return readMoney(r.amount);
  if (r?.refundAmount !== undefined && r?.refundAmount !== null) return readMinorMoney(r.refundAmount);
  return readMoney(r?.totalAmount) || readMoney(r?.price) || 0;
}

function extractItemReturnAmount(it) {
  if (!it) return 0;
  if (Array.isArray(it.decisions)) {
    const sum = it.decisions.reduce((s, d) => s + readMoney(d?.amount), 0);
    if (sum) return sum;
  }
  if (it.amount !== undefined && it.amount !== null) return readMoney(it.amount);
  if (it.refundAmount !== undefined && it.refundAmount !== null) return readMinorMoney(it.refundAmount);
  return readMoney(it.totalAmount) || readMoney(it.price) || 0;
}

function classifyCharge(type) {
  const t = String(type || '').toUpperCase();
  if (!t) return null;

  if (
    t.includes('ACQUIR') ||
    t.includes('PAYMENT') ||
    t.includes('TRANSFER') ||
    t.includes('BANK') ||
    t.includes('EKVAYR')
  ) {
    return 'acquiring';
  }

  if (
    t.includes('DELIVERY') ||
    t.includes('LOGISTIC') ||
    t.includes('FULFILL') ||
    t.includes('STORAGE') ||
    t.includes('SORT') ||
    t.includes('RETURN') ||
    t.includes('MIDDLE_MILE') ||
    t.includes('CROSSREGIONAL')
  ) {
    return 'logistics';
  }

  if (
    t.includes('FEE') ||
    t.includes('COMMISSION') ||
    t.includes('MARKET') ||
    t.includes('AGENCY') ||
    t.includes('SERVICE')
  ) {
    return 'fees';
  }

  return null;
}
function sumCommissions(list) {
  const out = { fees: 0, acquiring: 0, logistics: 0 };
  if (!Array.isArray(list)) return out;

  for (const c of list) {
    const type = c?.type || c?.service || c?.name || '';
    const amount = readMoney(
      c?.actual ??
        c?.amount ??
        c?.value ??
        c?.price ??
        c?.sum ??
        0
    );
    if (!amount) continue;

    const bucket = classifyCharge(type);
    if (bucket === 'acquiring') out.acquiring += Math.abs(amount);
    else if (bucket === 'logistics') out.logistics += Math.abs(amount);
    else if (bucket === 'fees') out.fees += Math.abs(amount);
    else out.fees += Math.abs(amount);
  }

  return out;
}

function sumPayoutCharges(payouts) {
  const out = { fees: 0, acquiring: 0, logistics: 0 };
  if (!Array.isArray(payouts)) return out;

  for (const p of payouts) {
    const items = []
      .concat(p?.services || [])
      .concat(p?.items || [])
      .concat(p?.operations || [])
      .concat(p?.transactions || [])
      .concat(p?.accruals || [])
      .concat(p?.charges || [])
      .concat(p?.payoutItems || []);

    for (const it of items) {
      const type =
        it?.type || it?.service || it?.name || it?.operationType || it?.serviceName || it?.title;
      const amount = readMoney(
        it?.amount ??
          it?.value ??
          it?.total ??
          it?.price ??
          it?.sum ??
          it?.cost ??
          it?.fee
      );
      if (!amount) continue;

      const bucket = classifyCharge(type);
      if (!bucket) continue;
      out[bucket] += Math.abs(amount);
    }
  }

  return out;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function classifyOrderStatus(order) {
  const status = normalizeStatus(order?.status);
  const sub =
    normalizeStatus(order?.substatus || order?.subStatus || order?.statusDetails || order?.sub_status);
  const text = `${status} ${sub}`.trim();
  if (!text) return { bucket: 'new', cancelled: false };

  const cancelled =
    text.includes('CANCEL') ||
    text.includes('REJECT') ||
    text.includes('UNPAID_CANCELLED') ||
    text.includes('CANCELLED');
  if (cancelled) return { bucket: 'cancelled', cancelled: true };

  if (text.includes('DELIVERED')) return { bucket: 'delivered', cancelled: false };

  if (
    text.includes('DELIVERY') ||
    text.includes('PICKUP') ||
    text.includes('SHIP') ||
    text.includes('SORT') ||
    text.includes('PACK') ||
    text.includes('READY') ||
    text.includes('PROCESS')
  ) {
    return { bucket: 'warehouse', cancelled: false };
  }

  return { bucket: 'new', cancelled: false };
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

function applyTotalToItems(itemAgg, field, total, currentTotal, revenue) {
  if (!total || total <= 0) return currentTotal;
  if (currentTotal > 0) {
    const k = total / currentTotal;
    for (const it of itemAgg.values()) {
      it[field] = (it[field] || 0) * k;
    }
  } else if (revenue > 0) {
    for (const it of itemAgg.values()) {
      it[field] = (it.revenue || 0) * (total / revenue);
    }
  }
  return total;
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
  const hasTokenMapCampaigns = tokenMap.some((t) => t.campaignIds && t.campaignIds.length);
  if (!campaignIds.length && !hasTokenMapCampaigns) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  if (!apiKeys.length) {
    throw new Error('YANDEX_SELLER_API_KEY missing');
  }

  const orders = [];
  const returns = [];
  const payouts = [];

  const returnType = process.env.YANDEX_RETURNS_TYPE;
  const returnStatuses = process.env.YANDEX_RETURNS_STATUSES;

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
      fetchReturnsByDate(dateStr, dateStr, campaignId, apiKey, {
        ...requestOptions,
        returnType,
        returnStatuses
      }).catch((e) => {
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
    const returnsList = returnsData.returns || [];
    for (const r of returnsList) {
      returns.push({ ...r, _campaignId: campaignId, _apiKey: apiKey });
    }
    payouts.push(...(payoutsData.payouts || []));

    if (RETURNS_DEBUG && returnsList.length) {
      const sample = returnsList.slice(0, 3).map((r) => {
        const items = r.items || r.returnItems || r.itemsInfo || [];
        const first = Array.isArray(items) && items.length ? items[0] : null;
        return {
          id: r.id || r.returnId || r.return_id,
          orderId: r.orderId || r.order_id || r.order?.id || r.order?.orderId,
          type: r.type,
          status: r.status,
          amount: r.amount,
          refundAmount: r.refundAmount,
          totalAmount: r.totalAmount,
          itemsCount: Array.isArray(items) ? items.length : 0,
          firstItem: first
            ? {
                sku: first.offerId || first.shopSku || first.sku,
                amount: first.amount,
                refundAmount: first.refundAmount,
                totalAmount: first.totalAmount
              }
            : null
        };
      });
      console.log(`Returns sample (${campaignId}):`, JSON.stringify(sample));
    }
  }

  let revenue = 0;
  let ordersCount = 0;
  let ordersCreated = 0;
  let ordersWarehouse = 0;
  let ordersDelivered = 0;
  let fees = 0;
  let acquiring = 0;
  let logistics = 0;
  let returnsSum = 0;

  const itemAgg = new Map();
  const returnsBySku = new Map();
  const returnsByOrder = new Map();
  const orderRevenueMap = new Map();

  for (const o of orders) {
    ordersCount += 1;
    const cls = classifyOrderStatus(o);
    if (!cls.cancelled) {
      ordersCreated += 1;
      if (cls.bucket === 'delivered') ordersDelivered += 1;
      else if (cls.bucket === 'warehouse') ordersWarehouse += 1;
    }
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

    let orderFees = pickNumber(o, [
      'fee',
      'fees',
      'marketplaceFee',
      'commission',
      'commissionFee',
      'marketplaceCommission'
    ]);
    let orderLogistics = pickNumber(o, [
      'delivery',
      'deliveryCost',
      'deliveryServiceCost',
      'logistics',
      'shipping',
      'shipment',
      'shipmentCost'
    ]);
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

    if ((!orderRevenue || orderRevenue === 0) && Array.isArray(o.items)) {
      orderRevenue = o.items.reduce((sum, it) => sum + getItemRevenue(it), 0);
    }
    if (!orderAcquiring && ACQUIRING_RATE > 0 && orderRevenue > 0) {
      orderAcquiring = orderRevenue * ACQUIRING_RATE;
    }

    revenue += orderRevenue;
    fees += orderFees;
    logistics += orderLogistics;
    acquiring += orderAcquiring;
    const orderId = o.id || o.orderId || o.order_id;
    if (orderId && orderRevenue > 0) {
      orderRevenueMap.set(String(orderId), orderRevenue);
    }
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

        const itemFees = pickNumber(it, [
          'fee',
          'fees',
          'commission',
          'marketplaceFee',
          'commissionFee'
        ]);
        const itemLogistics = pickNumber(it, [
          'delivery',
          'deliveryCost',
          'logistics',
          'shipping',
          'shipment'
        ]);
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

  returnsSum = 0;

  for (const r of returns) {
    let retAmount = extractReturnAmount(r);
    let items = r.items || r.returnItems || r.itemsInfo || [];

    // If amount missing, try to fetch return details
    const orderId =
      r.orderId || r.order_id || r.order?.id || r.order?.orderId || r.order?.order_id;
    const returnId = r.id || r.returnId || r.return_id || r.return?.id || r.return?.returnId;

    if ((!retAmount || retAmount === 0) && orderId && returnId) {
      try {
        const detail = await fetchReturnById(
          r._campaignId || r.campaignId || r.campaign_id || r.campaignID || r.campaign || undefined,
          orderId,
          returnId,
          r._apiKey || r.apiKey || r.api_key || r.apiKeyId || null,
          requestOptions
        );
        const d = detail.result || detail;
        retAmount = extractReturnAmount(d) || retAmount;
        items = d.items || d.returnItems || d.itemsInfo || items;
      } catch (e) {
        // ignore detail errors
      }
    }

    let itemSum = 0;
    let totalQty = 0;
    const itemRows = [];

    if (Array.isArray(items)) {
      for (const it of items) {
        const sku = String(it.offerId || it.shopSku || it.sku || 'unknown');
        const qty = Number(it.count || it.quantity || 1) || 0;
        totalQty += qty;
        const amount = extractItemReturnAmount(it);
        if (amount) {
          itemSum += amount;
          returnsBySku.set(sku, (returnsBySku.get(sku) || 0) + amount);
        } else {
          itemRows.push({ sku, qty });
        }
      }
    }

    if (itemSum > 0) retAmount = itemSum;
    returnsSum += retAmount;
    if (orderId) {
      const key = String(orderId);
      returnsByOrder.set(key, (returnsByOrder.get(key) || 0) + retAmount);
    }

    // If item amounts missing, distribute by quantity
    if (retAmount > 0 && itemRows.length && totalQty > 0 && itemSum === 0) {
      const perUnit = retAmount / totalQty;
      for (const it of itemRows) {
        const total = perUnit * it.qty;
        returnsBySku.set(it.sku, (returnsBySku.get(it.sku) || 0) + total);
      }
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

  if (ordersDelivered > 0 && returnsByOrder.size) {
    let deliveredNet = ordersDelivered;
    for (const [oid, retAmount] of returnsByOrder.entries()) {
      const orderRevenue = orderRevenueMap.get(oid) || 0;
      if (!orderRevenue) continue;
      if (retAmount >= orderRevenue * 0.9) {
        deliveredNet -= 1;
      }
    }
    if (deliveredNet < 0) deliveredNet = 0;
    ordersDelivered = deliveredNet;
  }

  const payoutAcquiring = sumByKeys(payouts, [
    'acquiring',
    'acquiringFee',
    'paymentFee',
    'paymentProcessingFee',
    'bankFee',
    'processingFee'
  ]);
  const payoutCharges = sumPayoutCharges(payouts);
  if (payoutAcquiring > 0 && payoutCharges.acquiring === 0) {
    payoutCharges.acquiring = payoutAcquiring;
  }

  fees = applyTotalToItems(itemAgg, 'fees', payoutCharges.fees, fees, revenue);
  logistics = applyTotalToItems(itemAgg, 'logistics', payoutCharges.logistics, logistics, revenue);
  acquiring = applyTotalToItems(itemAgg, 'acquiring', payoutCharges.acquiring, acquiring, revenue);

  await prisma.sellerDaily.upsert({
    where: { projectId_date: { projectId, date: day } },
    update: {
      revenue,
      orders: ordersCount,
      ordersCreated,
      ordersWarehouse,
      ordersDelivered,
      fees,
      acquiring,
      logistics,
      returns: returnsSum
    },
    create: {
      projectId,
      date: day,
      revenue,
      orders: ordersCount,
      ordersCreated,
      ordersWarehouse,
      ordersDelivered,
      fees,
      acquiring,
      logistics,
      returns: returnsSum
    }
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

  return {
    revenue,
    orders: ordersCount,
    ordersCreated,
    ordersWarehouse,
    ordersDelivered,
    fees,
    acquiring,
    logistics,
    returns: returnsSum,
    errors
  };
}

module.exports = { syncDay };
