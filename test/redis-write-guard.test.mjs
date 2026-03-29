import assert from 'node:assert/strict';

function reverseString(value = '') {
  return String(value || '').split('').reverse().join('');
}

function encodeWriteTokenForConfig(token = '') {
  return reverseString(Buffer.from(String(token || '').trim(), 'utf8').toString('base64'));
}

function decodeWriteToken(encoded = '') {
  const normalized = String(encoded || '').trim();
  if (!normalized) return '';
  try {
    const reversed = reverseString(normalized);
    return Buffer.from(reversed, 'base64').toString('utf8');
  } catch {
    return normalized;
  }
}

const token = 'gQAAAAAAAU1DAAIncDE2OThhMWFkOTlmODk0OTJmYTkxYThmNzcxZDgxZDRiNXAxODUzMTU';
const encoded = encodeWriteTokenForConfig(token);
assert.notEqual(encoded, token, '混淆后的写token不应与原文完全一致');
assert.equal(decodeWriteToken(encoded), token, '运行时应能正确还原混淆后的写token');
assert.equal(decodeWriteToken(''), '', '空写token应安全返回空字符串');

console.log('redis write guard: ok');

