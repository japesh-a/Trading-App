/**
 * Deterministic, educational execution model. Prices and P/L are quoted in USD;
 * quantity means BTC, index units, troy ounces, or GBP respectively. All contract
 * multipliers are 1. No spread, commissions, financing, leverage, or margin model
 * is included. OHLC bars do not reveal the sequence of intrabar prices: if both
 * exits are touched, the stop wins. Stops can slip across an opening gap; target
 * limits receive the requested price, without favourable gap improvement.
 */
export const INITIAL_BALANCE = 10000;
export const EXECUTION_ASSUMPTIONS = Object.freeze({
  currency: 'USD', spread: 0, commission: 0, financing: 0,
  intrabarConflict: 'stop-first', stopGapFill: 'bar-open', targetGapFill: 'target-price',
  marginModel: 'none',
});
export const INSTRUMENTS = Object.freeze({
  BTC: Object.freeze({ id: 'BTC', label: 'Bitcoin', symbol: 'BTC / USD', decimals: 2, multiplier: 1, unit: 'BTC' }),
  US500: Object.freeze({ id: 'US500', label: 'US 500', symbol: 'US 500', decimals: 2, multiplier: 1, unit: 'index units' }),
  XAUUSD: Object.freeze({ id: 'XAUUSD', label: 'Gold', symbol: 'XAU / USD', decimals: 2, multiplier: 1, unit: 'oz' }),
  GBPUSD: Object.freeze({ id: 'GBPUSD', label: 'Cable', symbol: 'GBP / USD', decimals: 5, multiplier: 1, unit: 'GBP' }),
});

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const direction = trade => trade.side === 'buy' ? 1 : -1;
const amount = value => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

export function validateOrder(order) {
  if (!order || typeof order !== 'object') return ['Enter an order first.'];
  const errors = [];
  if (!['buy', 'sell'].includes(order.side)) errors.push('Choose Buy or Sell.');
  for (const [field, label] of [['entry', 'Entry'], ['stopLoss', 'Stop loss'], ['takeProfit', 'Take profit'], ['quantity', 'Quantity']]) {
    if (!positive(order[field])) errors.push(`${label} must be a positive, finite number.`);
  }
  if (positive(order.entry) && positive(order.stopLoss)) {
    if (order.side === 'buy' && order.stopLoss >= order.entry) errors.push('A buy stop loss must be below entry.');
    if (order.side === 'sell' && order.stopLoss <= order.entry) errors.push('A sell stop loss must be above entry.');
  }
  if (positive(order.entry) && positive(order.takeProfit)) {
    if (order.side === 'buy' && order.takeProfit <= order.entry) errors.push('A buy take profit must be above entry.');
    if (order.side === 'sell' && order.takeProfit >= order.entry) errors.push('A sell take profit must be below entry.');
  }
  if (errors.length === 0) {
    const risk = Math.abs(order.entry - order.stopLoss) * order.quantity;
    const reward = Math.abs(order.takeProfit - order.entry) * order.quantity;
    if (!positive(risk) || !positive(reward) || !positive(reward / risk)) errors.push('Order size is outside the supported numeric range.');
  }
  return errors;
}

export function openTrade(order, options = {}) {
  const errors = validateOrder(order);
  const { mode = 'daily', challengeId = null, time, reasoning = '', balance = INITIAL_BALANCE } = options;
  const instrumentId = typeof options.instrument === 'string' ? options.instrument : options.instrument?.id;
  const instrument = INSTRUMENTS[instrumentId];
  if (!instrument) errors.push('Choose a supported instrument.');
  if (!['daily', 'paper'].includes(mode)) errors.push('Choose a daily or paper session.');
  if (!timestamp(time)) errors.push('Entry time must be a Unix timestamp in seconds.');
  if (!positive(balance)) errors.push('The account needs a positive balance to open a trade.');
  if (errors.length) throw new RangeError(errors.join(' '));
  const initialRisk = Math.abs(order.entry - order.stopLoss) * order.quantity * instrument.multiplier;
  if (initialRisk > balance) throw new RangeError('Planned loss exceeds the available account balance.');
  return {
    id: globalThis.crypto?.randomUUID?.() || `trade-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    instrument: { ...instrument }, mode, challengeId,
    side: order.side, entry: order.entry, stopLoss: order.stopLoss,
    takeProfit: order.takeProfit, quantity: order.quantity,
    initialRisk, plannedRR: Math.abs(order.takeProfit - order.entry) / Math.abs(order.entry - order.stopLoss),
    entryTime: time, lastBarTime: time, reasoning: String(reasoning).slice(0, 12000),
    notes: '', status: 'open', lastPrice: order.entry, unrealizedPnl: 0,
    balanceAtEntry: balance, assumptions: { ...EXECUTION_ASSUMPTIONS },
  };
}

export function markToMarket(trade, price) {
  if (trade.status === 'closed') return trade.pnl;
  if (!positive(price)) throw new RangeError('Mark price must be a positive, finite number.');
  return amount((price - trade.entry) * direction(trade) * trade.quantity * (trade.instrument?.multiplier ?? 1));
}

export function closeTrade(trade, price, time, exitReason = 'manual') {
  if (trade.status === 'closed') return trade;
  if (!timestamp(time) || time < trade.entryTime || time < (trade.lastBarTime ?? trade.entryTime)) {
    throw new RangeError('Exit time cannot be earlier than the latest processed price.');
  }
  const pnl = markToMarket(trade, price);
  return {
    ...trade, status: 'closed', exit: price, exitPrice: price, exitTime: time,
    exitReason, pnl, realizedR: pnl / trade.initialRisk, lastPrice: price,
    lastBarTime: time, unrealizedPnl: 0, durationSeconds: time - trade.entryTime,
  };
}

function validateBar(bar) {
  if (!bar || !timestamp(bar.time) || !['open', 'high', 'low', 'close'].every(key => positive(bar[key]))) {
    throw new RangeError('A candle needs a valid time and positive OHLC prices.');
  }
  if (bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) {
    throw new RangeError('Candle high and low must contain its open and close.');
  }
}

/** Only feed newly revealed, completed bars. Entry/current and repeated bars are ignored. */
export function advanceTrade(trade, bar) {
  if (trade.status === 'closed') return trade;
  validateBar(bar);
  if (bar.time <= Math.max(trade.entryTime, trade.lastBarTime ?? trade.entryTime)) return trade;
  const buy = trade.side === 'buy';
  const stopGap = buy ? bar.open <= trade.stopLoss : bar.open >= trade.stopLoss;
  const targetGap = buy ? bar.open >= trade.takeProfit : bar.open <= trade.takeProfit;
  if (stopGap) return closeTrade(trade, bar.open, bar.time, 'stop-loss-gap');
  if (targetGap) return closeTrade(trade, trade.takeProfit, bar.time, 'take-profit');
  const hitStop = buy ? bar.low <= trade.stopLoss : bar.high >= trade.stopLoss;
  const hitTarget = buy ? bar.high >= trade.takeProfit : bar.low <= trade.takeProfit;
  if (hitStop) return {
    ...closeTrade(trade, trade.stopLoss, bar.time, 'stop-loss'),
    ambiguousBar: hitTarget,
  };
  if (hitTarget) return closeTrade(trade, trade.takeProfit, bar.time, 'take-profit');
  return { ...trade, lastBarTime: bar.time, lastPrice: bar.close, unrealizedPnl: markToMarket(trade, bar.close) };
}

/** Closed trades only. Drawdown is in USD; equity starts at the $10,000 paper balance. */
export function summarizeTrades(trades = []) {
  const closed = trades.filter(trade => trade?.status === 'closed' && Number.isFinite(trade.pnl))
    .slice().sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0));
  let wins = 0, losses = 0, grossProfit = 0, grossLoss = 0, netPnl = 0;
  let sumR = 0, rCount = 0, sumPlannedRR = 0, rrCount = 0;
  let peak = INITIAL_BALANCE, maxDrawdown = 0, maxDrawdownPercent = 0;
  const equityCurve = [{ time: null, equity: INITIAL_BALANCE, drawdown: 0, tradeId: null }];
  for (const trade of closed) {
    if (trade.pnl > 0) { wins++; grossProfit += trade.pnl; }
    if (trade.pnl < 0) { losses++; grossLoss -= trade.pnl; }
    if (Number.isFinite(trade.realizedR)) { sumR += trade.realizedR; rCount++; }
    if (Number.isFinite(trade.plannedRR)) { sumPlannedRR += trade.plannedRR; rrCount++; }
    netPnl = amount(netPnl + trade.pnl);
    const equity = amount(INITIAL_BALANCE + netPnl);
    peak = Math.max(peak, equity);
    const drawdown = amount(peak - equity);
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, peak ? drawdown / peak * 100 : 0);
    equityCurve.push({ time: trade.exitTime ?? null, equity, drawdown, tradeId: trade.id });
  }
  return {
    count: closed.length, wins, losses, breakevens: closed.length - wins - losses,
    winRate: closed.length ? wins / closed.length * 100 : 0,
    netPnl, avgR: rCount ? sumR / rCount : 0, avgPlannedRR: rrCount ? sumPlannedRR / rrCount : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : null,
    grossProfit: amount(grossProfit), grossLoss: amount(grossLoss),
    maxDrawdown, maxDrawdownPercent, equityCurve,
  };
}
