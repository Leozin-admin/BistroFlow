/* utils.js — helpers genéricos */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const formatBRL = (n) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

window.$   = $;
window.$$  = $$;
window.utils = { prefersReducedMotion, clamp, formatBRL, sleep, escapeHTML };
