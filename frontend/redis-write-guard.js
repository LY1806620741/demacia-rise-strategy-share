import { state } from './state.js';

function reverseString(value = '') {
  return String(value || '').split('').reverse().join('');
}

function decodeWriteToken(encoded = '') {
  const normalized = String(encoded || '').trim();
  if (!normalized) return '';
  try {
    const reversed = reverseString(normalized);
    return atob(reversed);
  } catch {
    return normalized;
  }
}

export function getRedisWriteToken() {
  const redis = state?.config?.community?.upstash_redis || {};
  const direct = String(redis.write_token || redis.writeToken || '').trim();
  const encoded = String(redis.write_token_obfuscated || redis.writeTokenObfuscated || '').trim();
  return direct || decodeWriteToken(encoded);
}

export function hasRedisWriteCapability() {
  return !!getRedisWriteToken();
}

export function encodeWriteTokenForConfig(token = '') {
  return reverseString(btoa(String(token || '').trim()));
}

