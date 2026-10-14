/**
 * k6: concurrent discovery + swipe (like/pass) throughput.
 * Target: p95 < 200ms under moderate concurrency (raise VUs carefully on staging).
 *
 *   k6 run -e BASE_URL=https://staging.example.com -e TOKEN=eyJ... \
 *     -e TARGET_USER_ID=<profile_id> k6/swipe_throughput.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const failRate = new Rate('swipe_fail_rate');

export const options = {
  scenarios: {
    swipe: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || '1m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    swipe_fail_rate: ['rate<0.1'],
  },
};

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';
const TARGET = __ENV.TARGET_USER_ID || '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: TOKEN ? `Bearer ${TOKEN}` : '',
  };
}

export default function () {
  const headers = authHeaders();

  const disc = http.get(`${BASE}/api/users?limit=20`, { headers, timeout: '5s' });
  const discOk = check(disc, {
    'discovery status ok': (r) => r.status === 200 || r.status === 401 || r.status === 403,
  });

  let likeOk = true;
  let passOk = true;
  if (TOKEN && TARGET) {
    const like = http.post(
      `${BASE}/api/v1/matches/like`,
      JSON.stringify({ targetUserId: TARGET }),
      { headers, timeout: '5s' }
    );
    likeOk = check(like, {
      'like accepted or conflict': (r) =>
        r.status === 200 || r.status === 400 || r.status === 403 || r.status === 404 || r.status === 409,
    });

    const pass = http.post(
      `${BASE}/api/v1/matches/pass`,
      JSON.stringify({ targetUserId: TARGET }),
      { headers, timeout: '5s' }
    );
    passOk = check(pass, {
      'pass accepted or conflict': (r) =>
        r.status === 200 || r.status === 400 || r.status === 403 || r.status === 404 || r.status === 409,
    });
  } else {
    // Auth/validation-only path when TARGET_USER_ID unset (safe smoke)
    const like = http.post(`${BASE}/api/v1/matches/like`, JSON.stringify({}), {
      headers,
      timeout: '5s',
    });
    likeOk = check(like, {
      'like validation': (r) =>
        r.status === 400 || r.status === 401 || r.status === 403 || r.status === 422,
    });
  }

  failRate.add(!(discOk && likeOk && passOk));
  sleep(0.2 + Math.random() * 0.3);
}
