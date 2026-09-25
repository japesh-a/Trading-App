/**
 * A small, self-contained SVG chart for the practice and paper trading desks.
 * Only candles passed to setData are rendered. Drawing anchors use UTC time and
 * price, so adding replay bars, resizing, and zooming never move a user's plan.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const UP = '#32d5af';
const DOWN = '#f4778c';
const INK = '#a2b2c8';
let chartSequence = 0;

const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));
const copy = value => JSON.parse(JSON.stringify(value));
const line = (x1, y1, x2, y2, color, extra = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;
const text = (x, y, value, color = INK, size = 10, extra = '') =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${escapeXml(value)}</text>`;

function timestamp(value, index = 0) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return Math.abs(value) < 1e11 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value && typeof value === 'object' && value.year) return Date.UTC(value.year, value.month - 1, value.day);
  return Date.UTC(2025, 0, 1) + index * 3600000;
}

function candlesFrom(values) {
  const byTime = new Map();
  (Array.isArray(values) ? values : []).forEach((candle, index) => {
    if (!candle || !['open', 'high', 'low', 'close'].every(key => finite(candle[key]))) return;
    const time = timestamp(candle.time ?? candle.timestamp ?? candle.date, index);
    if (!Number.isFinite(time)) return;
    const open = Number(candle.open), close = Number(candle.close);
    byTime.set(time, {
      time, open, close,
      high: Math.max(Number(candle.high), Number(candle.low), open, close),
      low: Math.min(Number(candle.low), Number(candle.high), open, close),
      volume: Math.max(0, Number(candle.volume) || 0)
    });
  });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function cleanDrawings(values) {
  if (!Array.isArray(values)) return [];
  const validPoint = point => point && finite(point.time) && finite(point.price);
  return values.slice(0, 100).flatMap((drawing, index) => {
    if (!drawing || !['trend', 'horizontal', 'label'].includes(drawing.type)) return [];
    const points = drawing.type === 'trend' ? drawing.points : [{ time: drawing.time, price: drawing.price }];
    if (!Array.isArray(points) || !points.every(validPoint) || (drawing.type === 'trend' && points.length !== 2)) return [];
    return [{
      id: String(drawing.id || `restored-${index}`).slice(0, 80), type: drawing.type,
      ...(drawing.type === 'trend' ? { points: points.map(point => ({ time: Number(point.time), price: Number(point.price) })) }
        : { time: Number(drawing.time), price: Number(drawing.price) }),
      ...(drawing.type === 'label' ? { text: String(drawing.text || 'My note').slice(0, 120) } : {})
    }];
  });
}

export class TradingChart {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) throw new Error('TradingChart requires a container element.');
    this.id = `wl-chart-${++chartSequence}`;
    this.symbol = String(options.symbol || 'MARKET');
    this.decimals = clamp(Math.round(Number(options.decimals) || 0), 0, 8);
    if (options.decimals === undefined) this.decimals = 2;
    this.onLevelChange = typeof options.onLevelChange === 'function' ? options.onLevelChange : () => {};
    this.onDrawingsChange = typeof options.onDrawingsChange === 'function' ? options.onDrawingsChange : () => {};
    this.levels = {};
    this.editable = true;
    this.candles = [];
    this.drawings = cleanDrawings(options.drawings);
    this.tool = 'cursor';
    this.labelText = 'My note';
    this.viewCount = 72;
    this.viewStart = 0;
    this.hover = null;
    this.drag = null;
    this.draft = null;
    this.selected = null;
    this.pointers = new Map();
    this.pinching = false;
    this.destroyed = false;
    this.frame = null;
    this.width = 800;
    this.height = 440;
    this.handlers = [];

    const initialHeight = this.container.clientHeight;
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'wl-chart';
    this.wrapper.style.height = `${Math.max(320, initialHeight || 440)}px`;
    this.wrapper.innerHTML = `<style>
      .wl-chart { position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;background:#0a1220;border:1px solid #233047;border-radius:12px;box-sizing:border-box;color:#a2b2c8;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      .wl-chart * { box-sizing:border-box; }
      .wl-chart__svg { display:block;width:100%;height:100%;min-height:320px;touch-action:none;user-select:none;outline:none; }
      .wl-chart__svg:focus-visible { outline:2px solid #77adff;outline-offset:-3px;border-radius:12px; }
      .wl-chart__readout { position:absolute;top:14px;left:15px;right:80px;display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;pointer-events:none;line-height:1.25;font-size:10px;font-variant-numeric:tabular-nums; }
      .wl-chart__symbol { font-size:11px;font-weight:750;letter-spacing:.08em;color:#e1ebfa; }
      .wl-chart__ohlc { color:#8d9db5;white-space:nowrap; }
      .wl-chart__ohlc b { font-weight:550;color:#c3d1e3; }
      .wl-chart__reset { position:absolute;top:8px;right:8px;min-height:28px;border:1px solid #2c3d57;background:#111f32;color:#a9bdd8;border-radius:6px;padding:4px 8px;cursor:pointer;font:600 10px/1.2 Inter,system-ui,sans-serif; }
      .wl-chart__reset:hover { background:#20334e;color:#e8f1ff; }
      .wl-chart__reset:focus-visible { outline:2px solid #77adff;outline-offset:2px; }
      .wl-chart__hint { position:absolute;left:14px;bottom:34px;font-size:9px;color:#61758f;pointer-events:none;letter-spacing:.02em; }
      .wl-chart[data-tool="trend"] .wl-chart__svg,.wl-chart[data-tool="horizontal"] .wl-chart__svg,.wl-chart[data-tool="label"] .wl-chart__svg { cursor:crosshair; }
      .wl-chart__live { position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%); }
      @media(max-width:600px) { .wl-chart__readout { top:12px;gap:4px 8px; }.wl-chart__ohlc { font-size:9px; }.wl-chart__hint { font-size:8px; } }
    </style>
    <svg class="wl-chart__svg" xmlns="${SVG_NS}" tabindex="0" role="application" aria-label="Interactive candlestick chart. Drag to pan, scroll to zoom. Select drawing tools above the chart; press Escape to cancel a drawing and Delete to remove a selected drawing."></svg>
    <div class="wl-chart__readout"><span class="wl-chart__symbol"></span><span class="wl-chart__ohlc"></span></div>
    <button class="wl-chart__reset" type="button" title="Fit recent candles and trade levels">Reset view</button>
    <div class="wl-chart__hint">SCROLL TO ZOOM · DRAG TO PAN</div>
    <span class="wl-chart__live" role="status" aria-live="polite"></span>`;
    this.container.append(this.wrapper);
    this.svg = this.wrapper.querySelector('svg');
    this.readout = this.wrapper.querySelector('.wl-chart__ohlc');
    this.hint = this.wrapper.querySelector('.wl-chart__hint');
    this.live = this.wrapper.querySelector('.wl-chart__live');
    this.wrapper.querySelector('.wl-chart__symbol').textContent = this.symbol;
    this.listen(this.svg, 'pointerdown', event => this.pointerDown(event));
    this.listen(this.svg, 'pointermove', event => this.pointerMove(event));
    this.listen(this.svg, 'pointerup', event => this.pointerUp(event));
    this.listen(this.svg, 'pointercancel', event => this.pointerUp(event, true));
    this.listen(this.svg, 'pointerleave', () => { if (!this.drag) { this.hover = null; this.schedule(); } });
    this.listen(this.svg, 'wheel', event => this.wheel(event), { passive: false });
    this.listen(this.svg, 'keydown', event => this.keyDown(event));
    this.listen(this.svg, 'dblclick', event => { if (this.tool === 'cursor' && !event.target.closest('[data-level],[data-drawing]')) this.resetView(); });
    this.listen(this.wrapper.querySelector('button'), 'click', () => this.resetView());
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(entries => this.resize(entries[0]?.contentRect));
      this.observer.observe(this.container);
    } else this.listen(window, 'resize', () => this.resize());
    this.setLevels(options.levels || {});
    this.setData(options.candles || []);
    this.resize();
  }

  listen(element, event, callback, options) {
    element.addEventListener(event, callback, options);
    this.handlers.push(() => element.removeEventListener(event, callback, options));
  }

  resize(contentBounds) {
    if (this.destroyed) return;
    const bounds = contentBounds || { width: this.container.clientWidth, height: this.container.clientHeight };
    this.width = Math.max(280, Math.round(bounds.width || 800));
    this.height = Math.max(320, Math.round(bounds.height || 440));
    // An unstyled container has the wrapper's minimum height. The host may set
    // any explicit height; the SVG always fits that size without layout loops.
    this.wrapper.style.height = `${this.height}px`;
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.schedule();
  }

  setData(candles) {
    const wasFollowing = !this.candles.length || this.viewStart + this.viewCount >= this.candles.length - 1;
    this.candles = candlesFrom(candles);
    if (wasFollowing) this.viewStart = Math.max(0, this.candles.length - this.viewCount + 4);
    else this.constrainView();
    this.schedule();
  }

  setLevels(levels = {}, { editable = true } = {}) {
    this.levels = Object.fromEntries(['entry', 'stopLoss', 'takeProfit'].flatMap(key =>
      finite(levels[key]) ? [[key, Number(levels[key])]] : []));
    this.editable = Boolean(editable);
    this.schedule();
  }

  setTool(tool) {
    this.tool = ['cursor', 'trend', 'horizontal', 'label'].includes(tool) ? tool : 'cursor';
    this.draft = null;
    this.wrapper.dataset.tool = this.tool;
    this.hint.textContent = {
      cursor: 'SCROLL TO ZOOM · DRAG TO PAN',
      trend: 'CLICK TWO POINTS FOR A TREND LINE · ESC TO CANCEL',
      horizontal: 'CLICK A PRICE TO MARK A LEVEL',
      label: 'CLICK THE CHART TO PLACE YOUR NOTE'
    }[this.tool];
    this.schedule();
  }

  setLabel(value) { this.labelText = String(value || 'My note').trim().slice(0, 120) || 'My note'; }

  clearDrawings() {
    this.drawings = [];
    this.draft = null;
    this.selected = null;
    this.onDrawingsChange([]);
    this.live.textContent = 'All chart drawings cleared.';
    this.schedule();
  }

  getDrawings() { return copy(this.drawings); }

  resetView() {
    this.viewCount = 72;
    this.viewStart = Math.max(0, this.candles.length - this.viewCount + 4);
    this.hover = null;
    this.schedule();
  }

  constrainView() {
    this.viewCount = clamp(this.viewCount, 10, Math.max(100, Math.min(600, this.candles.length + 16)));
    this.viewStart = clamp(this.viewStart, -4, Math.max(0, this.candles.length - Math.min(this.viewCount, 8)));
  }

  geometry() {
    const right = this.width < 480 ? 76 : 92;
    return { left: 10, top: this.width < 480 ? 57 : 43, right: this.width - right,
      bottom: this.height - 104, volumeTop: this.height - 91, volumeBottom: this.height - 34,
      width: this.width - right - 10 };
  }

  range() {
    if (this.renderRange) return this.renderRange;
    if (this.drag?.range) return this.drag.range;
    const from = Math.max(0, Math.floor(this.viewStart));
    const to = Math.min(this.candles.length, Math.ceil(this.viewStart + this.viewCount));
    const visible = this.candles.slice(from, to);
    const values = visible.flatMap(candle => [candle.low, candle.high]).concat(Object.values(this.levels));
    if (!values.length) return { min: 0, max: 100 };
    let min = Math.min(...values), max = Math.max(...values);
    const span = max - min || Math.max(Math.abs(max) * 0.01, 1);
    min -= span * 0.15;
    max += span * 0.15;
    return { min, max };
  }

  x(index) { const g = this.geometry(); return g.left + ((index - this.viewStart + 0.5) / this.viewCount) * g.width; }
  y(price) { const g = this.geometry(), r = this.range(); return g.bottom - (price - r.min) / (r.max - r.min) * (g.bottom - g.top); }
  priceAt(y) { const g = this.geometry(), r = this.range(); return r.min + (g.bottom - y) / (g.bottom - g.top) * (r.max - r.min); }
  indexAt(x) { const g = this.geometry(); return this.viewStart + (x - g.left) / g.width * this.viewCount - 0.5; }

  interval() {
    const length = this.candles.length;
    if (length < 2) return 3600000;
    return Math.max(1, this.candles[length - 1].time - this.candles[length - 2].time);
  }

  timeAt(index) {
    if (!this.candles.length) return Date.UTC(2025, 0, 1) + index * 3600000;
    const lower = Math.floor(index), fraction = index - lower;
    if (index < 0) return this.candles[0].time + index * this.interval();
    if (lower >= this.candles.length - 1) return this.candles.at(-1).time + (index - this.candles.length + 1) * this.interval();
    return this.candles[lower].time + fraction * (this.candles[lower + 1].time - this.candles[lower].time);
  }

  indexFor(time) {
    if (!this.candles.length) return 0;
    if (time <= this.candles[0].time) return (time - this.candles[0].time) / this.interval();
    if (time >= this.candles.at(-1).time) return this.candles.length - 1 + (time - this.candles.at(-1).time) / this.interval();
    let low = 0, high = this.candles.length - 1;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (this.candles[mid].time <= time) low = mid;
      else high = mid;
    }
    return low + (time - this.candles[low].time) / (this.candles[high].time - this.candles[low].time);
  }

  formatPrice(value) {
    this.priceFormatter ||= new Intl.NumberFormat('en-GB', { minimumFractionDigits: this.decimals, maximumFractionDigits: this.decimals });
    return this.priceFormatter.format(Number(value));
  }

  dateLabel(time, full = false) {
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) return '';
    this.dayFormatter ||= new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    this.timeFormatter ||= new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    if (full) return `${this.dayFormatter.format(date)} ${this.timeFormatter.format(date)} UTC`;
    return this.interval() >= 86400000 ? this.dayFormatter.format(date) : this.timeFormatter.format(date);
  }

  point(event) {
    const bounds = this.svg.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * this.width / (bounds.width || this.width),
      y: (event.clientY - bounds.top) * this.height / (bounds.height || this.height) };
  }

  inPlot(point) {
    const g = this.geometry();
    return point.x >= g.left && point.x <= g.right && point.y >= g.top && point.y <= g.bottom;
  }

  anchor(point) { return { time: this.timeAt(this.indexAt(point.x)), price: this.priceAt(point.y) }; }

  pointerDown(event) {
    if (event.button !== 0 || this.destroyed || !this.candles.length) return;
    event.preventDefault();
    this.svg.focus({ preventScroll: true });
    const point = this.point(event);
    this.pointers.set(event.pointerId, point);
    try { this.svg.setPointerCapture(event.pointerId); } catch { /* detached SVG */ }
    if (this.pointers.size === 2) {
      const points = [...this.pointers.values()];
      this.pinching = true;
      this.pinch = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        count: this.viewCount, index: this.indexAt((points[0].x + points[1].x) / 2) };
      this.drag = null;
      return;
    }
    if (this.pointers.size > 1) return;
    const level = event.target.closest('[data-level]')?.getAttribute('data-level');
    const drawingId = event.target.closest('[data-drawing]')?.getAttribute('data-drawing');
    if (level && this.editable) {
      this.drag = { type: 'level', key: level, start: point, range: this.range(), initial: { ...this.levels }, pointer: event.pointerId };
      this.svg.style.cursor = 'ns-resize';
    } else if (drawingId && this.tool === 'cursor') {
      this.selected = drawingId;
      const drawing = this.drawings.find(item => item.id === drawingId);
      this.drag = { type: 'drawing', start: point, range: this.range(), initial: copy(drawing),
        endpoint: event.target.getAttribute('data-point'), pointer: event.pointerId };
      this.svg.style.cursor = 'grabbing';
    } else if (this.inPlot(point)) {
      this.selected = null;
      this.drag = { type: this.tool === 'cursor' ? 'pan' : 'place', start: point,
        viewStart: this.viewStart, pointer: event.pointerId, moved: false };
      if (this.tool === 'cursor') this.svg.style.cursor = 'grabbing';
    }
    this.hover = point;
    this.schedule();
  }

  pointerMove(event) {
    if (this.destroyed) return;
    const point = this.point(event);
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, point);
    if (this.pinching) {
      if (this.pointers.size === 2 && this.pinch) {
        const points = [...this.pointers.values()];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const g = this.geometry(), middle = (points[0].x + points[1].x) / 2;
        this.viewCount = this.pinch.count * this.pinch.distance / Math.max(10, distance);
        this.constrainView();
        this.viewStart = this.pinch.index + 0.5 - (middle - g.left) / g.width * this.viewCount;
        this.constrainView();
        this.schedule();
      }
      return;
    }
    this.hover = point;
    const drag = this.drag;
    if (drag && drag.pointer === event.pointerId) {
      const dx = point.x - drag.start.x, dy = point.y - drag.start.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.type === 'level') {
        const g = this.geometry();
        this.levels[drag.key] = Number(this.priceAt(clamp(point.y, g.top, g.bottom)).toFixed(this.decimals));
        this.onLevelChange({ ...this.levels });
      } else if (drag.type === 'pan') {
        this.viewStart = drag.viewStart - dx / this.geometry().width * this.viewCount;
        this.constrainView();
      } else if (drag.type === 'drawing') {
        const deltaIndex = dx / this.geometry().width * this.viewCount;
        const deltaPrice = this.priceAt(point.y) - this.priceAt(drag.start.y);
        const move = source => ({ time: this.timeAt(this.indexFor(source.time) + deltaIndex), price: source.price + deltaPrice });
        const drawing = this.drawings.find(item => item.id === this.selected);
        if (drawing.type === 'trend') drawing.points = drag.initial.points.map((item, index) =>
          drag.endpoint === null || Number(drag.endpoint) === index ? move(item) : { ...item });
        else Object.assign(drawing, move(drag.initial));
      }
    }
    this.schedule();
  }

  pointerUp(event, cancelled = false) {
    this.pointers.delete(event.pointerId);
    try { this.svg.releasePointerCapture(event.pointerId); } catch { /* no capture */ }
    if (this.pinching) {
      if (!this.pointers.size) { this.pinching = false; this.pinch = null; }
      return;
    }
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const point = this.point(event);
    if (drag.type === 'level') {
      if (cancelled) this.levels = drag.initial;
      this.onLevelChange({ ...this.levels });
      this.live.textContent = `${{ entry: 'Entry', stopLoss: 'Stop loss', takeProfit: 'Take profit' }[drag.key]} ${this.formatPrice(this.levels[drag.key])}.`;
    } else if (drag.type === 'drawing') {
      if (cancelled) {
        const index = this.drawings.findIndex(item => item.id === drag.initial.id);
        if (index >= 0) this.drawings[index] = drag.initial;
      }
      this.onDrawingsChange(this.getDrawings());
    } else if (drag.type === 'place' && !cancelled && !drag.moved && this.inPlot(point)) {
      this.placeDrawing(point);
    }
    this.drag = null;
    this.svg.style.cursor = '';
    if (event.pointerType === 'touch') this.hover = null;
    this.schedule();
  }

  placeDrawing(point) {
    if (this.drawings.length >= 100) { this.live.textContent = 'Drawing limit reached. Clear a drawing to add another.'; return; }
    const anchor = this.anchor(point);
    const id = `${this.id}-${Date.now()}-${this.drawings.length}`;
    if (this.tool === 'trend') {
      if (!this.draft) { this.draft = anchor; this.live.textContent = 'First point added. Select the end of your trend line.'; return; }
      this.drawings.push({ id, type: 'trend', points: [this.draft, anchor] });
      this.draft = null;
    } else if (this.tool === 'horizontal') this.drawings.push({ id, type: 'horizontal', ...anchor });
    else if (this.tool === 'label') this.drawings.push({ id, type: 'label', ...anchor, text: this.labelText });
    else return;
    this.selected = id;
    this.onDrawingsChange(this.getDrawings());
    this.live.textContent = `${this.tool === 'label' ? 'Note' : 'Line'} added to chart.`;
  }

  wheel(event) {
    if (!this.candles.length) return;
    event.preventDefault();
    const point = this.point(event), index = this.indexAt(point.x), g = this.geometry();
    if (event.shiftKey) this.viewStart += (event.deltaY || event.deltaX) / g.width * this.viewCount * 0.6;
    else {
      this.viewCount *= Math.exp(clamp(event.deltaY, -100, 100) * 0.0025);
      this.constrainView();
      this.viewStart = index + 0.5 - (point.x - g.left) / g.width * this.viewCount;
    }
    this.constrainView();
    this.schedule();
  }

  keyDown(event) {
    if (event.key === 'Escape') { this.draft = null; this.selected = null; this.setTool('cursor'); }
    else if (['Delete', 'Backspace'].includes(event.key) && this.selected) {
      event.preventDefault();
      this.drawings = this.drawings.filter(item => item.id !== this.selected);
      this.selected = null;
      this.onDrawingsChange(this.getDrawings());
      this.live.textContent = 'Selected drawing deleted.';
    } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      this.viewStart += (event.key === 'ArrowLeft' ? -1 : 1) * this.viewCount * 0.1;
      this.constrainView();
    } else if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      this.viewCount *= event.key === '-' ? 1.2 : 1 / 1.2;
      this.constrainView();
    } else if (event.key.toLowerCase() === 'r') this.resetView();
    this.schedule();
  }

  schedule() {
    if (this.destroyed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  drawingSvg(drawing, snapshot = false) {
    const g = this.geometry(), selected = !snapshot && drawing.id === this.selected;
    const color = selected ? '#bedaff' : '#77adff';
    const attributes = `data-drawing="${escapeXml(drawing.id)}"`;
    if (drawing.type === 'trend') {
      const points = drawing.points.map(point => ({ x: this.x(this.indexFor(point.time)), y: this.y(point.price) }));
      return `<g ${attributes}>${!snapshot ? line(points[0].x, points[0].y, points[1].x, points[1].y, 'transparent', 'stroke-width="16" style="cursor:move"') : ''}
        ${line(points[0].x, points[0].y, points[1].x, points[1].y, color, 'stroke-width="1.6"')}
        ${selected ? points.map((point, index) => `<circle data-point="${index}" ${attributes} cx="${point.x}" cy="${point.y}" r="5" stroke="${color}" stroke-width="2" fill="#0a1220" style="cursor:move"/>`).join('') : ''}</g>`;
    }
    const x = this.x(this.indexFor(drawing.time)), y = this.y(drawing.price);
    if (drawing.type === 'horizontal') return `<g ${attributes}>${!snapshot ? line(g.left, y, g.right, y, 'transparent', 'stroke-width="15" style="cursor:ns-resize"') : ''}
      ${line(g.left, y, g.right, y, color, 'stroke-width="1.25" stroke-dasharray="5 4"')}
      ${text(g.left + 7, y - 6, this.formatPrice(drawing.price), color, 10)}</g>`;
    const labelWidth = Math.min(g.width - 12, Math.max(66, drawing.text.length * 6 + 20));
    const labelX = clamp(x, g.left + 2, g.right - labelWidth - 2);
    const shown = drawing.text.length > Math.floor((labelWidth - 16) / 6)
      ? `${drawing.text.slice(0, Math.max(3, Math.floor((labelWidth - 24) / 6)))}…` : drawing.text;
    return `<g ${attributes} style="cursor:move"><path d="M${x} ${y}l5 -8h-10z" fill="#20395b" stroke="${color}"/>
      <rect x="${labelX}" y="${y - 32}" width="${labelWidth}" height="25" rx="5" fill="#14253e" stroke="${color}" stroke-width="${selected ? 1.5 : 0.8}"/>
      ${text(labelX + 9, y - 16, shown, '#d8e8ff', 10)}<title>${escapeXml(drawing.text)}</title></g>`;
  }

  chartSvg(snapshot = false) {
    const g = this.geometry(), range = this.range();
    this.renderRange = range;
    const span = range.max - range.min;
    const rawStep = span / (this.height < 390 ? 5 : 6);
    const magnitude = 10 ** Math.floor(Math.log10(rawStep || 1));
    const normalized = rawStep / magnitude;
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    const parts = [
      `<defs><clipPath id="${this.id}-plot"><rect x="${g.left}" y="${g.top}" width="${g.width}" height="${g.bottom - g.top}"/></clipPath><clipPath id="${this.id}-volume"><rect x="${g.left}" y="${g.volumeTop}" width="${g.width}" height="${g.volumeBottom - g.volumeTop}"/></clipPath></defs>`,
      '<rect width="100%" height="100%" fill="#0a1220"/>',
      `<g font-family="Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-variant-numeric="tabular-nums">`,
      line(g.right, g.top - 7, g.right, this.height - 27, '#233047'),
      line(g.left, g.volumeTop - 7, g.right, g.volumeTop - 7, '#1a293e'),
      line(g.left, g.volumeBottom + 6, this.width - 8, g.volumeBottom + 6, '#233047')
    ];
    for (let value = Math.ceil(range.min / step) * step, count = 0; value <= range.max && count < 20; value += step, count++) {
      const y = this.y(value);
      parts.push(line(g.left, y, g.right, y, '#17253a'), text(g.right + 9, y + 3, this.formatPrice(value), '#7388a4', 10));
    }
    const stride = g.width / this.viewCount;
    const timeStep = Math.max(1, Math.ceil(100 / stride));
    const startIndex = Math.max(0, Math.floor(this.viewStart));
    const endIndex = Math.min(this.candles.length - 1, Math.ceil(this.viewStart + this.viewCount));
    for (let index = Math.ceil(startIndex / timeStep) * timeStep; index <= endIndex; index += timeStep) {
      const x = this.x(index);
      if (x > g.right || x < g.left) continue;
      parts.push(line(x, g.top, x, g.volumeBottom, '#152237'), text(x, this.height - 10, this.dateLabel(this.candles[index].time), '#758ba7', 10, 'text-anchor="middle"'));
    }
    if (!this.candles.length) {
      parts.push(text(g.left + g.width / 2, this.height / 2 - 8, 'Chart ready for market data', '#b0c1d8', 13, 'text-anchor="middle"'),
        text(g.left + g.width / 2, this.height / 2 + 15, 'Candles appear when a session is loaded.', '#647b98', 10, 'text-anchor="middle"'));
    }
    parts.push(`<g clip-path="url(#${this.id}-plot)">`);
    const levels = this.levels;
    if (finite(levels.entry)) {
      [['stopLoss', DOWN], ['takeProfit', UP]].forEach(([key, color]) => {
        if (!finite(levels[key])) return;
        const y1 = this.y(levels.entry), y2 = this.y(levels[key]);
        parts.push(`<rect x="${g.left + g.width * 0.7}" y="${Math.min(y1, y2)}" width="${g.width * 0.3}" height="${Math.max(1, Math.abs(y1 - y2))}" fill="${color}" fill-opacity="0.065"/>`);
      });
    }
    const candleWidth = clamp(stride * 0.65, 1.2, 16);
    for (let index = startIndex; index <= endIndex; index++) {
      const candle = this.candles[index], x = this.x(index), color = candle.close >= candle.open ? UP : DOWN;
      const top = Math.min(this.y(candle.open), this.y(candle.close));
      const height = Math.max(1.2, Math.abs(this.y(candle.open) - this.y(candle.close)));
      parts.push(line(x, this.y(candle.high), x, this.y(candle.low), color, 'stroke-width="1"'),
        `<rect x="${x - candleWidth / 2}" y="${top}" width="${candleWidth}" height="${height}" rx="0.6" fill="${color}"/>`);
    }
    parts.push(this.drawings.map(drawing => this.drawingSvg(drawing, snapshot)).join(''));
    if (!snapshot && this.draft) {
      const start = { x: this.x(this.indexFor(this.draft.time)), y: this.y(this.draft.price) };
      if (this.hover) parts.push(line(start.x, start.y, this.hover.x, this.hover.y, '#91bdff', 'stroke-dasharray="4 4" stroke-width="1.5"'));
      parts.push(`<circle cx="${start.x}" cy="${start.y}" r="4" fill="#91bdff"/>`);
    }
    parts.push('</g>');
    const visible = this.candles.slice(startIndex, endIndex + 1);
    const maximumVolume = Math.max(1, ...visible.map(candle => candle.volume));
    parts.push(`<g clip-path="url(#${this.id}-volume)">`);
    for (let index = startIndex; index <= endIndex; index++) {
      const candle = this.candles[index], barHeight = candle.volume / maximumVolume * (g.volumeBottom - g.volumeTop);
      parts.push(`<rect x="${this.x(index) - candleWidth / 2}" y="${g.volumeBottom - barHeight}" width="${candleWidth}" height="${barHeight}" fill="${candle.close >= candle.open ? UP : DOWN}" fill-opacity="0.28"/>`);
    }
    parts.push('</g>', text(g.right + 9, g.volumeTop + 9, 'VOL', '#617793', 9));
    const latest = this.candles.at(-1);
    if (latest) {
      const y = this.y(latest.close), color = latest.close >= latest.open ? UP : DOWN;
      if (y >= g.top && y <= g.bottom) parts.push(line(g.left, y, g.right, y, color, 'stroke-dasharray="2 4" stroke-opacity="0.45"'),
        `<rect x="${g.right + 1}" y="${y - 9}" width="${this.width - g.right - 6}" height="18" rx="3" fill="${color}"/>`,
        text(g.right + 7, y + 3, this.formatPrice(latest.close), '#09251f', 10, 'font-weight="650"'));
    }
    [['entry', '#8aaaf8', 'ENTRY'], ['stopLoss', DOWN, 'SL'], ['takeProfit', UP, 'TP']].forEach(([key, color, name]) => {
      if (!finite(levels[key])) return;
      const y = this.y(levels[key]);
      if (y < g.top || y > g.bottom) return;
      const label = `${name}  ${this.formatPrice(levels[key])}`, labelWidth = Math.max(94, label.length * 5.9 + 22);
      const labelX = Math.max(g.left + 4, g.right - labelWidth - 10);
      parts.push(`<g data-level="${key}" ${!snapshot && this.editable ? 'style="cursor:ns-resize"' : ''}>`,
        !snapshot && this.editable ? line(g.left, y, g.right, y, 'transparent', 'stroke-width="18"') : '',
        line(g.left, y, g.right, y, color, 'stroke-width="1" stroke-dasharray="5 4" stroke-opacity="0.85"'),
        `<rect x="${labelX}" y="${y - 11}" width="${labelWidth}" height="22" rx="4" fill="#142139" stroke="${color}" stroke-opacity="0.8"/>`,
        text(labelX + 10, y + 3.5, label, color, 10, 'font-weight="650"'),
        !snapshot && this.editable ? `${line(labelX + labelWidth - 12, y - 3, labelX + labelWidth - 6, y - 3, color)}${line(labelX + labelWidth - 12, y + 1, labelX + labelWidth - 6, y + 1, color)}${line(labelX + labelWidth - 12, y + 5, labelX + labelWidth - 6, y + 5, color)}` : '',
        '</g>');
    });
    if (!snapshot && this.hover && this.inPlot(this.hover) && !['level', 'drawing', 'pan'].includes(this.drag?.type)) {
      const index = clamp(Math.round(this.indexAt(this.hover.x)), 0, this.candles.length - 1);
      const candle = this.candles[index];
      if (candle) {
        const x = this.x(index), y = this.hover.y;
        parts.push(`<g pointer-events="none">${line(x, g.top, x, g.volumeBottom, '#7c90aa', 'stroke-width="0.7" stroke-dasharray="3 4"')}${line(g.left, y, g.right, y, '#7c90aa', 'stroke-width="0.7" stroke-dasharray="3 4"')}`,
          `<rect x="${g.right + 1}" y="${y - 10}" width="${this.width - g.right - 4}" height="20" rx="3" fill="#344760"/>`,
          text(g.right + 7, y + 3, this.formatPrice(this.priceAt(y)), '#eff5ff', 10),
          `<rect x="${clamp(x - 69, g.left, Math.max(g.left, g.right - 138))}" y="${this.height - 25}" width="138" height="21" rx="3" fill="#2a3a51"/>`,
          text(clamp(x - 69, g.left, Math.max(g.left, g.right - 138)) + 69, this.height - 11, this.dateLabel(candle.time, true), '#dfebfc', 9, 'text-anchor="middle"'), '</g>');
      }
    }
    if (snapshot) {
      parts.push(text(15, 24, this.symbol, '#e1ebfa', 11, 'font-weight="700"'),
        text(this.width - 14, 24, latest ? this.dateLabel(latest.time, true) : '', '#7e94b0', 10, 'text-anchor="end"'),
        text(g.left + 4, g.volumeTop + 12, 'WICKLUME / TRADE JOURNAL', '#415875', 9, 'letter-spacing="1"'));
    }
    parts.push('</g>');
    this.renderRange = null;
    return parts.join('');
  }

  render() {
    if (this.destroyed) return;
    this.svg.innerHTML = this.chartSvg();
    let candle = this.candles.at(-1);
    if (this.hover && this.inPlot(this.hover)) candle = this.candles[clamp(Math.round(this.indexAt(this.hover.x)), 0, this.candles.length - 1)] || candle;
    this.readout.innerHTML = candle ? ['open', 'high', 'low', 'close'].map((key, index) =>
      `${['O', 'H', 'L', 'C'][index]} <b>${escapeXml(this.formatPrice(candle[key]))}</b>`).join(' &nbsp; ') : 'Awaiting candles';
  }

  snapshot() {
    return `<svg xmlns="${SVG_NS}" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" role="img"><title>${escapeXml(this.symbol)} trade chart</title><desc>A recorded trade chart with candles, entry, stop loss, take profit, and the trader's drawings. Times are UTC.</desc>${this.chartSvg(true)}</svg>`;
  }

  destroy() {
    this.destroyed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.handlers.forEach(remove => remove());
    this.handlers = [];
    this.pointers.clear();
    this.wrapper.remove();
  }
}
