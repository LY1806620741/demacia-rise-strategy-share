const redisUrl = String(process.env.UPSTASH_REDIS_URL || '').trim();
const redisToken = String(process.env.UPSTASH_REDIS_WRITE_TOKEN || '').trim();
const redisKey = String(process.env.UPSTASH_REDIS_KEY || 'community:latest-pointer-record').trim();
const pointerCid = String(process.env.POINTER_CID || '').trim();
const source = String(process.env.POINTER_SOURCE || 'github-action').trim();

if (!redisUrl) throw new Error('Missing UPSTASH_REDIS_URL');
if (!redisToken) throw new Error('Missing UPSTASH_REDIS_WRITE_TOKEN');
if (!pointerCid) throw new Error('Missing POINTER_CID');

const payload = {
  version: 1,
  pointerCid,
  updatedAt: Date.now(),
  peerId: 'github-actions',
  providerStatus: '由 GitHub Action 发布发现入口',
  source,
};

const response = await fetch(`${redisUrl}/set/${encodeURIComponent(redisKey)}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${redisToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ value: JSON.stringify(payload) }),
});

if (!response.ok) {
  const text = await response.text();
  throw new Error(`Upstash write failed: ${response.status} ${text}`);
}

const result = await response.json();
console.log(JSON.stringify({ ok: true, key: redisKey, pointerCid, result }, null, 2));

