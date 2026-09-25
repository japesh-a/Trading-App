import { INITIAL_BALANCE, summarizeTrades } from './trade-engine.js';

// This is a local device journal, not a shared account or verified leaderboard.
const PREFIX = 'wicklume.trading.v1.';
const memory = new Map();
const unsaved = new Set();
let warningHandler = null;
let lastWarning = null;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function warn(operation, error) {
  lastWarning = {
    operation, message: 'Browser storage is unavailable or full. Your latest changes are held in this tab only; export your journal before closing it.',
    detail: error?.message || String(error), time: Date.now(),
  };
  try { warningHandler?.({ ...lastWarning }); } catch { /* A UI callback must not interrupt trade execution. */ }
  try {
    if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent('wicklume:storage-warning', { detail: { ...lastWarning } }));
    }
  } catch { /* Storage is still retained in memory when events are unavailable. */ }
}

export function setStorageWarningHandler(handler) {
  warningHandler = typeof handler === 'function' ? handler : null;
  if (warningHandler && lastWarning) {
    try { warningHandler({ ...lastWarning }); } catch { /* Same isolation as warn(). */ }
  }
}

export function getStorageWarning() { return lastWarning ? { ...lastWarning } : null; }

function read(key, fallback) {
  if (unsaved.has(key)) return clone(memory.has(key) ? memory.get(key) : fallback);
  try {
    const storage = globalThis.localStorage;
    if (!storage) throw new Error('Local storage is not available in this context.');
    const raw = storage.getItem(PREFIX + key);
    if (raw === null) { memory.delete(key); return clone(fallback); }
    const value = JSON.parse(raw);
    memory.set(key, value);
    return clone(value);
  } catch (error) {
    warn('read', error);
    return clone(memory.has(key) ? memory.get(key) : fallback);
  }
}

function write(key, value) {
  const safe = clone(value);
  memory.set(key, safe);
  try {
    const storage = globalThis.localStorage;
    if (!storage) throw new Error('Local storage is not available in this context.');
    storage.setItem(PREFIX + key, JSON.stringify(safe));
    unsaved.delete(key);
  } catch (error) {
    unsaved.add(key);
    warn('write', error);
  }
  return clone(safe);
}

export function getTrades() {
  const trades = read('trades', []);
  if (!Array.isArray(trades)) {
    warn('read', new Error('The saved journal is not a list of trades.'));
    return [];
  }
  return trades.filter(trade => trade && typeof trade.id === 'string')
    .sort((a, b) => (b.exitTime ?? b.entryTime ?? 0) - (a.exitTime ?? a.entryTime ?? 0));
}

export function loadAccount() {
  const saved = read('account', {});
  const netPnl = summarizeTrades(getTrades().filter(trade => trade.mode === 'paper')).netPnl;
  return {
    ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}),
    displayName: typeof saved?.displayName === 'string' && saved.displayName.trim() ? saved.displayName.trim().slice(0, 40) : 'You',
    initialBalance: INITIAL_BALANCE, currency: 'USD',
    balance: Math.round((INITIAL_BALANCE + netPnl) * 1e8) / 1e8,
  };
}

export function saveAccount(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Account settings must be an object.');
  const account = loadAccount();
  write('account', {
    ...account, ...value,
    displayName: String(value.displayName ?? account.displayName).trim().slice(0, 40) || 'You',
    initialBalance: INITIAL_BALANCE, balance: account.balance, currency: 'USD',
  });
  return loadAccount();
}

export function recordTrade(trade) {
  if (!trade || typeof trade.id !== 'string' || !trade.id || !['open', 'closed'].includes(trade.status)) {
    throw new TypeError('A journal entry needs a trade ID and an open or closed status.');
  }
  if (trade.status === 'closed' && !Number.isFinite(trade.pnl)) throw new TypeError('A closed trade needs a finite P/L.');
  const trades = getTrades();
  const index = trades.findIndex(item => item.id === trade.id);
  if (index >= 0 && trades[index].status === 'closed' && trade.status === 'open') return clone(trades[index]);
  const value = index >= 0 ? { ...trades[index], ...clone(trade) } : clone(trade);
  if (index >= 0) trades[index] = value;
  else trades.push(value);
  write('trades', trades);
  return clone(value);
}

export function updateTradeNotes(id, notes) {
  const trades = getTrades();
  const trade = trades.find(item => item.id === id);
  if (!trade) return null;
  trade.notes = String(notes ?? '').slice(0, 12000);
  trade.notesUpdatedAt = Date.now();
  write('trades', trades);
  return clone(trade);
}

function sessionKey(key) {
  if (typeof key !== 'string' || !key.trim()) throw new TypeError('A session needs a nonempty key.');
  return `session.${key}`;
}

export function getSession(key) { return read(sessionKey(key), null); }
export function saveSession(key, value) { return write(sessionKey(key), value); }
export function clearSession(key) {
  const name = sessionKey(key);
  memory.delete(name);
  try {
    const storage = globalThis.localStorage;
    if (!storage) throw new Error('Local storage is not available in this context.');
    storage.removeItem(PREFIX + name);
    unsaved.delete(name);
  } catch (error) {
    unsaved.add(name);
    warn('delete', error);
  }
}
