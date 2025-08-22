// Simple in-memory book of positions keyed by email+symbol.
// This survives while the Node process is up (good for demo / webinar).

/**
 * book = {
 *   [email]: {
 *     [symbol]: { symbol, side: 'BUY'|'SELL', qty, entry, sl?, tp?, openedAt, updatedAt }
 *   }
 * }
 */
const book = Object.create(null);

function getUserMap(email) {
  const key = String(email || 'guest');
  if (!book[key]) book[key] = Object.create(null);
  return book[key];
}

/**
 * Upsert/flip/close a position.
 * - Same side: average entry and add qty
 * - Opposite side: reduce; if overshoot, flip to the new side with net qty
 */
function placeOrder({ email, symbol, side, qty, entry, sl, tp }) {
  const map = getUserMap(email);
  const now = Date.now();

  if (!map[symbol]) {
    map[symbol] = { symbol, side, qty: Math.abs(qty), entry, sl, tp, openedAt: now, updatedAt: now };
    return map[symbol];
  }

  const p = map[symbol];

  // Same side → average entry & add qty
  if (p.side === side) {
    const newQty = Math.abs(p.qty) + Math.abs(qty);
    const avg    = ((p.entry * Math.abs(p.qty)) + (entry * Math.abs(qty))) / (newQty || 1);
    p.qty   = newQty;
    p.entry = +avg;
    if (sl !== undefined) p.sl = sl;
    if (tp !== undefined) p.tp = tp;
    p.updatedAt = now;
    return p;
  }

  // Opposite side → reduce / close / flip
  const net = Math.abs(p.qty) - Math.abs(qty);

  if (net > 0) {
    // Reduce existing; keep side/entry, qty decreases
    p.qty = net;
    p.updatedAt = now;
    return p;
  } else if (net === 0) {
    // Fully closed
    delete map[symbol];
    return null;
  } else {
    // Flip to new side with remaining qty
    p.side  = side;
    p.qty   = Math.abs(net);
    p.entry = entry;
    if (sl !== undefined) p.sl = sl;
    if (tp !== undefined) p.tp = tp;
    p.updatedAt = now;
    return p;
  }
}

function setStops({ email, symbol, sl, tp }) {
  const map = getUserMap(email);
  const p = map[symbol];
  if (!p) return null;
  if (sl !== undefined) p.sl = sl;
  if (tp !== undefined) p.tp = tp;
  p.updatedAt = Date.now();
  return p;
}

function listPositions(email) {
  const map = getUserMap(email);
  return Object.values(map);
}

module.exports = { placeOrder, setStops, listPositions };
