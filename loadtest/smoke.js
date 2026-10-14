// k6 load test. Install k6 (https://k6.io), then:
//   k6 run loadtest/smoke.js                                  # against production
//   BASE_URL=http://localhost:3000 k6 run loadtest/smoke.js    # against a local container
//
// Only hits read-only or free endpoints. It never creates checkouts, leads or accounts.
// The thresholds mirror the SLOs in docs/SLO.md, so a run "passes" only if the SLOs hold under load.
import http from 'k6/http';
import { check, sleep } from 'k6';

// A 429 from the rate limiter is expected behavior under load, not an error.
http.setResponseCallback(http.expectedStatuses(200, 429));

const BASE = __ENV.BASE_URL || 'https://deal-engine-rose.vercel.app';

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 }, // warm up
        { duration: '1m', target: 25 },  // steady load
        { duration: '30s', target: 0 },  // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],                    // < 1% errors
    'http_req_duration{name:analyze}': ['p(95)<800'],  // analyzer API p95 under 800 ms
    'http_req_duration{name:health}': ['p(95)<1500'],  // readiness includes a DB round trip
    'http_req_duration{name:page}': ['p(95)<1500'],
  },
};

const deal = JSON.stringify({
  askingPrice: 400000, annualRevenue: 300000, sellerProfit: 150000, ownerSalary: 50000,
  annualCapex: 8000, downPaymentPct: 10, interestRate: 10.5, loanTermYears: 10,
});

export default function () {
  const page = http.get(`${BASE}/`, { tags: { name: 'page' } });
  check(page, { 'home page 200': (r) => r.status === 200 });

  const analyze = http.post(`${BASE}/api/analyze`, deal, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'analyze' },
  });
  // 429 means the per-IP rate limiter did its job; count it separately from real failures.
  check(analyze, {
    'analyze 200 or rate-limited': (r) => r.status === 200 || r.status === 429,
    'analyze returns a verdict': (r) => r.status !== 200 || !!r.json('verdict'),
  });

  const health = http.get(`${BASE}/api/health`, { tags: { name: 'health' } });
  check(health, { 'health ok': (r) => r.status === 200 });

  sleep(1);
}
