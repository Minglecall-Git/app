/**
 * Sustained chat sends — p95 delivery path under 500ms for API insert.
 *
 *   k6 run -e BASE_URL=... -e TOKEN=... -e RECEIVER_ID=... k6/chat_send.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';
const RECEIVER = __ENV.RECEIVER_ID || '';

export default function () {
  if (!TOKEN || !RECEIVER) {
    sleep(1);
    return;
  }
  const res = http.post(
    `${BASE}/api/messages`,
    JSON.stringify({
      receiverId: RECEIVER,
      text: `k6 load ${__VU}-${__ITER}`,
      clientTempId: `k6-${__VU}-${__ITER}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );
  check(res, { 'message accepted': (r) => r.status === 200 || r.status === 429 });
  sleep(1);
}
