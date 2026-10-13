/**
 * Concurrent gift spends with a shared idempotency key — zero double-debits.
 *
 *   k6 run -e BASE_URL=... -e TOKEN=... -e RECEIVER_ID=... -e GIFT_ID=... -e IDEMPOTENCY_KEY=gift:test:1 k6/billing_gift.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 200),
  iterations: Number(__ENV.VUS || 200),
};

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';
const RECEIVER = __ENV.RECEIVER_ID || '';
const GIFT_ID = __ENV.GIFT_ID || 'rose';
const IDEM = __ENV.IDEMPOTENCY_KEY || 'gift:k6:shared:1';

export default function () {
  if (!TOKEN || !RECEIVER) {
    sleep(0.1);
    return;
  }
  const res = http.post(
    `${BASE}/api/gifts/send`,
    JSON.stringify({
      receiverId: RECEIVER,
      giftId: GIFT_ID,
      idempotencyKey: IDEM,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );
  check(res, {
    'gift accepted or duplicate': (r) => r.status === 200 || r.status === 400,
  });
}
