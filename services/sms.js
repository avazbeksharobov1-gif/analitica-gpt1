const fetch = require('node-fetch');

async function sendSms(phone, message) {
  if (process.env.SMS_TEST_MODE === 'true') {
    console.log(`[SMS TEST] ${phone}: ${message}`);
    return { ok: true, test: true };
  }

  const provider = (process.env.SMS_PROVIDER || 'eskiz').toLowerCase();
  if (provider !== 'eskiz') {
    throw new Error('SMS provider not configured');
  }

  const token = process.env.SMS_TOKEN;
  const sender = process.env.SMS_SENDER || 'Analitica';
  if (!token) throw new Error('SMS_TOKEN missing');

  const r = await fetch('https://notify.eskiz.uz/api/message/sms/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      mobile_phone: phone,
      message,
      from: sender
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`SMS error: ${r.status} ${JSON.stringify(data)}`);
  }
  return data;
}

module.exports = { sendSms };
