import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INSTRUMENTS, validateOrder, openTrade, advanceTrade, markToMarket, closeTrade, cancelPendingTrade, summarizeTrades } from './public/trade-engine.js';

const buy = { side: 'buy', entry: 100, stopLoss: 95, takeProfit: 110, quantity: 2 };
const sell = { side: 'sell', entry: 100, stopLoss: 105, takeProfit: 90, quantity: 2 };
const options = { instrument: INSTRUMENTS.BTC, mode: 'daily', challengeId: '2026-09-25', time: 1000, balance: 10000 };
const candle = overrides => ({ time: 1900, open: 100, high: 103, low: 98, close: 102, volume: 10, ...overrides });

test('order validation rejects invalid numbers, wrong-side exits, and unsupported instruments', () => {
  assert.deepEqual(validateOrder(buy), []);
  assert.deepEqual(validateOrder(sell), []);
  for (const value of [0, -1, NaN, Infinity, '2', null]) {
    for (const field of ['entry', 'stopLoss', 'takeProfit', 'quantity']) assert(validateOrder({ ...buy, [field]: value }).length);
  }
  assert(validateOrder(null).length);
  assert(validateOrder({ ...buy, side: 'hold' }).length);
  assert(validateOrder({ ...buy, stopLoss: 100 }).length);
  assert(validateOrder({ ...buy, takeProfit: 99 }).length);
  assert(validateOrder({ ...sell, stopLoss: 99 }).length);
  assert(validateOrder({ ...sell, takeProfit: 101 }).length);
  assert.throws(() => openTrade(buy, { ...options, instrument: 'UNKNOWN' }), /instrument/);
  assert.throws(() => openTrade(buy, { ...options, balance: 9 }), /balance/);
  assert.throws(() => openTrade(buy, { ...options, time: NaN }), /time/);
});

test('buy and sell P/L use instrument quantity and initial risk', () => {
  const long = openTrade(buy, options), short = openTrade(sell, options);
  assert.equal(long.initialRisk, 10);
  assert.equal(long.plannedRR, 2);
  assert.equal(markToMarket(long, 103), 6);
  assert.equal(markToMarket(short, 97), 6);
  assert.equal(markToMarket(short, 104), -8);
  assert.equal(closeTrade(long, 104, 2000).realizedR, 0.8);
  const cable = openTrade({ side: 'buy', entry: 1.3, stopLoss: 1.295, takeProfit: 1.31, quantity: 10000 }, { ...options, instrument: 'GBPUSD' });
  assert(Math.abs(cable.initialRisk - 50) < 1e-8);
  assert.equal(markToMarket(cable, 1.305), 50);
  assert.equal(cable.instrument.multiplier, 1);
});

test('long and short stop and target exits are symmetric', () => {
  const long = openTrade(buy, options), short = openTrade(sell, options);
  const longStop = advanceTrade(long, candle({ low: 94 }));
  assert.equal(longStop.exitPrice, 95);
  assert.equal(longStop.pnl, -10);
  assert.equal(longStop.exitReason, 'stop-loss');
  const longTarget = advanceTrade(long, candle({ high: 111 }));
  assert.equal(longTarget.exitPrice, 110);
  assert.equal(longTarget.pnl, 20);
  assert.equal(longTarget.realizedR, 2);
  assert.equal(advanceTrade(short, candle({ high: 106 })).pnl, -10);
  assert.equal(advanceTrade(short, candle({ low: 89 })).pnl, 20);
});

test('opening gaps can exceed planned stop risk and target gaps fill at limit', () => {
  const long = openTrade(buy, options), short = openTrade(sell, options);
  const longGap = advanceTrade(long, candle({ open: 92, high: 102, low: 90, close: 100 }));
  assert.equal(longGap.exitPrice, 92);
  assert.equal(longGap.pnl, -16);
  assert.equal(longGap.realizedR, -1.6);
  assert.equal(longGap.exitReason, 'stop-loss-gap');
  assert.equal(advanceTrade(short, candle({ open: 108, high: 110 })).exitPrice, 108);
  assert.equal(advanceTrade(long, candle({ open: 115, high: 116, low: 94, close: 100 })).exitPrice, 110);
  assert.equal(advanceTrade(short, candle({ open: 85, high: 106, low: 84, close: 100 })).exitPrice, 90);
});

test('a candle touching both exits conservatively stops the position', () => {
  for (const order of [buy, sell]) {
    const result = advanceTrade(openTrade(order, options), candle({ high: 111, low: 89 }));
    assert.equal(result.pnl, -10);
    assert.equal(result.ambiguousBar, true);
    assert.equal(result.exitReason, 'stop-loss');
  }
});

test('entry bars and repeated bars cannot retroactively trigger exits', () => {
  const trade = openTrade(buy, options);
  assert.equal(advanceTrade(trade, candle({ time: 1000, high: 120, low: 80 })), trade);
  assert.equal(advanceTrade(trade, candle({ time: 900, high: 120, low: 80 })), trade);
  const next = advanceTrade(trade, candle());
  assert.equal(next.status, 'open');
  assert.equal(next.unrealizedPnl, 4);
  assert.equal(advanceTrade(next, candle({ high: 120 })), next);
  assert.equal(trade.lastBarTime, 1000, 'The input position is not mutated');
  assert.equal(trade.unrealizedPnl, 0);
  assert.throws(() => closeTrade(next, 102, 1000), /earlier/);
  const closed = closeTrade(next, 102, 2000);
  assert.equal(advanceTrade(closed, candle({ time: 3000, low: 80 })), closed);
  assert.equal(closeTrade(closed, 80, 3000), closed);
  assert.equal(markToMarket(closed, 80), 4);
  assert.throws(() => advanceTrade(trade, candle({ high: 90 })), /high and low/);
});

test('summary excludes open positions, sorts exits, and measures peak-to-trough drawdown', () => {
  const entry = openTrade(buy, options);
  const trades = [
    closeTrade({ ...entry, id: 'third' }, 102.5, 4000),
    closeTrade({ ...entry, id: 'second' }, 92.5, 3000),
    closeTrade({ ...entry, id: 'first' }, 105, 2000),
    openTrade(sell, options),
  ];
  const stats = summarizeTrades(trades);
  assert.equal(stats.count, 3);
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 1);
  assert.equal(stats.winRate, 2 / 3 * 100);
  assert.equal(stats.netPnl, 0);
  assert.equal(stats.avgR, 0);
  assert.equal(stats.avgPlannedRR, 2);
  assert.equal(stats.profitFactor, 1);
  assert.equal(stats.maxDrawdown, 15);
  assert.deepEqual(stats.equityCurve.map(point => point.equity), [10000, 10010, 9995, 10000]);
  assert.equal(summarizeTrades([]).profitFactor, null);
  assert.equal(summarizeTrades([trades[0]]).profitFactor, Infinity);
  assert.equal(summarizeTrades([trades[1]]).profitFactor, 0);
});

test('journal deduplicates, preserves notes, isolates daily P/L, and survives storage failure', async () => {
  const values = new Map();
  let failing = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key) { if (failing) throw new Error('Blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (failing) throw new Error('Quota'); values.set(key, value); },
    removeItem(key) { if (failing) throw new Error('Blocked'); values.delete(key); },
  } });
  const store = await import('./public/trade-store.js');
  const warnings = [];
  store.setStorageWarningHandler(warning => warnings.push(warning));
  assert.equal(store.loadAccount().balance, 10000);
  assert.equal(store.loadAccount().displayName, 'You');
  const paper = closeTrade(openTrade(buy, { ...options, mode: 'paper' }), 105, 2000);
  const daily = closeTrade(openTrade(sell, options), 90, 2000);
  store.recordTrade(paper);
  store.recordTrade(paper);
  store.recordTrade(daily);
  assert.equal(store.getTrades().length, 2);
  assert.equal(store.loadAccount().balance, 10010);
  store.updateTradeNotes(paper.id, 'Waited for the retest.');
  assert.equal(store.getTrades().find(trade => trade.id === paper.id).notes, 'Waited for the retest.');
  store.recordTrade({ ...paper, status: 'open' });
  assert.equal(store.getTrades().find(trade => trade.id === paper.id).status, 'closed');
  assert.equal(store.saveAccount({ displayName: '  Alex  ', balance: 999999 }).balance, 10010);
  assert.equal(store.loadAccount().displayName, 'Alex');
  store.saveSession('daily-2026-09-25', { cursor: 12, trade: paper });
  assert.equal(store.getSession('daily-2026-09-25').cursor, 12);
  failing = true;
  store.saveSession('daily-2026-09-25', { cursor: 13 });
  assert.equal(store.getSession('daily-2026-09-25').cursor, 13);
  assert(warnings.length > 0);
  assert(store.getStorageWarning().message.includes('this tab only'));
  failing = false;
  assert.equal(store.getSession('daily-2026-09-25').cursor, 13, 'Stale persisted values cannot replace unsaved memory');
  store.saveSession('daily-2026-09-25', { cursor: 14 });
  store.clearSession('daily-2026-09-25');
  assert.equal(store.getSession('daily-2026-09-25'), null);
  delete globalThis.localStorage;
});

test('chosen-price orders wait for the level, fill once, and start exits on the next bar', () => {
  const pending = openTrade({ ...buy, entry: 105, stopLoss: 95 }, { ...options, entryType: 'trigger', currentPrice: 100 });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.entryTime, null);
  assert.equal(markToMarket(pending, 103), 0);
  const waiting = advanceTrade(pending, candle({ high: 104, low: 99 }));
  assert.equal(waiting.status, 'pending');
  const filled = advanceTrade(waiting, candle({ time: 2800, high: 112, low: 94 }));
  assert.equal(filled.status, 'open');
  assert.equal(filled.entryTime, 2800);
  assert.equal(filled.entry, 105);
  assert.equal(filled.pnl, undefined, 'The crossing bar cannot also settle an exit');
  const stopped = advanceTrade(filled, candle({ time: 3700, open: 104, high: 105, low: 94 }));
  assert.equal(stopped.status, 'closed');
  assert.equal(stopped.pnl, -20);
  const untouched = closeTrade(waiting, 102, 2800, 'session-end');
  assert.equal(untouched.entryFilled, false);
  assert.equal(untouched.pnl, 0);
  assert.equal(summarizeTrades([untouched, stopped]).count, 1);
  assert.equal(cancelPendingTrade(waiting, 2800).status, 'cancelled');
  assert.throws(() => closeTrade(waiting, 102, 2800), /Cancel/);
  const shortPending = openTrade({ ...sell, entry: 95, stopLoss: 105 }, { ...options, entryType: 'trigger', currentPrice: 100 });
  const shortFilled = advanceTrade(shortPending, candle({ low: 94 }));
  assert.equal(shortFilled.status, 'open');
  assert.equal(advanceTrade(shortFilled, candle({ time: 2800, open: 94, high: 96, low: 89, close: 92 })).pnl, 10);
});
