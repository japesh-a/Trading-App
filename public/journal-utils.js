const fields = ['id','mode','instrument','side','entryTime','entry','stopLoss','takeProfit','quantity','exitTime','exitPrice','exitReason','pnl','plannedRR','realizedR','reasoning','notes'];

function csvCell(value) {
  let text = String(value ?? '');
  // Quoting alone does not prevent spreadsheets from executing a text formula.
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function tradesCsv(trades) {
  return [fields.join(','), ...trades.map(trade => fields.map(field => csvCell(field === 'instrument' ? trade.instrument?.id : trade[field])).join(','))].join('\r\n');
}

export function matchesTradeSearch(trade, query) {
  const words = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const date = new Date(trade.exitTime * 1000);
  const day = trade.exitTime && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
  const haystack = [trade.instrument?.id, trade.instrument?.label, trade.side, trade.side === 'buy' ? 'long' : 'short', trade.mode, trade.reasoning, trade.notes, trade.exitReason,
    day].join(' ').toLocaleLowerCase();
  return words.every(word => haystack.includes(word));
}
