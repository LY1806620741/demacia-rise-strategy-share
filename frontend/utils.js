export function nowMs() {
  return Date.now();
}

export function byId(id) {
  return document.getElementById(id);
}

export function wasmArray(value) {
  return Array.isArray(value) ? value : [];
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function highlight(text, q) {
  if (!q || !text) return text;
  const terms = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.join('|')})`, 'ig');
  return text.replace(re, '<mark>$1</mark>');
}

