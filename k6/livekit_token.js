/**
 * k6: concurrent LiveKit token minting under load.
 *
 *   k6 run -e BASE_URL=https://staging.example.com -e TOKEN=eyJ... \
 *     -e CALL_ID=<active_call_id> k6/livekit_token.js
 *
 * Without CALL_ID, probes auth/validation only (no room join grant for real calls).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const failRate = new Rate('livekit_token_fail_rate');

export const options = {
  scenarios: {
    tokens: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 100),
      duration: __ENV.DURATION || '1m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    livekit_token_fail_rate: ['rate<0.1'],
  },
};

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';
const CALL_ID = __ENV.CALL_ID || '';

export default function () {
  const roomName = CALL_ID || `admin_test_room_k6_${__VU}`;
  const res = http.post(
    `${BASE}/api/livekit/token`,
    JSON.stringify({ roomName, callId: CALL_ID || undefined, name: `k6-vu-${__VU}` }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: TOKEN ? `Bearer ${TOKEN}` : '',
      },
      timeout: '8s',
    }
  );

  const ok = check(res, {
    'status not 5xx': (r) => r.status < 500,
    'auth or token response': (r) => {
      // 200 = token/config; 401/403 = auth/membership; 400 = validation
      return (
        r.status === 200 ||
        r.status === 400 ||
        r.status === 401 ||
        r.status === 403 ||
        r.status === 404 ||
        r.status === 409
      );
    },
  });
  failRate.add(!ok);
  sleep(0.1 + Math.random() * 0.2);
}
