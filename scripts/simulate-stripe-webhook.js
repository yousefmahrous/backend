import 'dotenv/config';
import stripe from '../src/core/config/stripe.config.js';

const [, , orderIdArg, eventTypeArg] = process.argv;

const orderId = parseInt(orderIdArg, 10);
const eventType = eventTypeArg;

const eventTypeMap = {
  completed: 'checkout.session.completed',
  expired: 'checkout.session.expired',
};

if (Number.isNaN(orderId) || !eventTypeMap[eventType]) {
  console.error(
    `الاستخدام: node scripts/simulate-stripe-webhook.js <orderId> <${Object.keys(eventTypeMap).join('|')}>`
  );
  process.exit(1);
}

const stripeEventType = eventTypeMap[eventType];

const sessionObject = {
  id: `cs_test_e2e_${Date.now()}`,
  metadata: { order_id: String(orderId) },
};

if (eventType === 'completed') {
  sessionObject.payment_intent = `pi_test_e2e_${Date.now()}`;
}

const fakeEvent = {
  id: `evt_test_e2e_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  type: stripeEventType,
  data: { object: sessionObject },
};

const payload = JSON.stringify(fakeEvent);

const signatureHeader = stripe.webhooks.generateTestHeaderString({
  payload,
  secret: process.env.STRIPE_WEBHOOK_SECRET,
});

const port = process.env.PORT || 3000;

async function main() {
  const response = await fetch(`http://localhost:${port}/api/v1/payment/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signatureHeader,
    },
    body: payload,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`الـ webhook رجّع status ${response.status}: ${text}`);
  }

  console.log(`تم إرسال حدث ${stripeEventType} للأوردر رقم ${orderId} بنجاح`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});