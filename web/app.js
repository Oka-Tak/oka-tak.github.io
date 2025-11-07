const PRODUCTS = [
  { id: 'butaman', name: '豚まん', price: 250, type: 'food' },
  { id: 'shikaman', name: '鹿まん', price: 350, type: 'food' },
  { id: 'shoronpo', name: '小籠包', price: 250, type: 'food' },
  { id: 'shikuwasa', name: 'シークワーサー', price: 200, type: 'drink' },
  { id: 'sugarcane', name: 'サトウキビジュース', price: 350, type: 'drink' },
  { id: 'wonglok', name: '王老吉', price: 400, type: 'drink' },
];

const PRODUCT_INDEX = new Map(PRODUCTS.map((p) => [p.id, p]));

const STORAGE_KEY_ORDER = 'festival-order';
const STORAGE_KEY_HISTORY = 'festival-history';
const MAX_HISTORY = 50;

const safeStorage = (() => {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('Local storage is not available:', error);
    return null;
  }
})();

const form = document.querySelector('#order-form');
const resetBtn = document.querySelector('#reset-btn');
const subtotalEl = document.querySelector('#subtotal');
const discountEl = document.querySelector('#discount');
const finalEl = document.querySelector('#final');
const appliedSetsEl = document.querySelector('#applied-sets');
const historyListEl = document.querySelector('#history-list');
const exportHistoryBtn = document.querySelector('#export-history');
const clearHistoryBtn = document.querySelector('#clear-history');

let historyEntries = [];

function calculateTotals(order) {
  const { pool, subtotal } = buildItemPool(order);
  let discount = 0;
  const appliedSets = [];

  while (canApplyDrinkTrio(pool)) {
    consumeDrinkTrio(pool);
    discount += 200;
    appliedSets.push('飲み物入り3品セット (-200)');
  }

  while (countByType(pool, 'food') >= 3) {
    consumeFoodTrio(pool);
    discount += 150;
    appliedSets.push('食品3品セット (-150)');
  }

  while (totalItems(pool) >= 2) {
    consumeAnyPair(pool);
    discount += 100;
    appliedSets.push('任意2品セット (-100)');
  }

  return {
    subtotal,
    discount,
    final: subtotal - discount,
    applied_sets: appliedSets,
  };
}

function buildItemPool(order) {
  const pool = new Map();
  let subtotal = 0;

  Object.entries(order).forEach(([itemId, quantity]) => {
    if (quantity <= 0) {
      return;
    }
    const product = PRODUCT_INDEX.get(itemId);
    if (!product) {
      throw new Error(`Unknown product: ${itemId}`);
    }
    pool.set(itemId, (pool.get(itemId) ?? 0) + quantity);
    subtotal += product.price * quantity;
  });

  return { pool, subtotal };
}

function totalItems(pool) {
  let total = 0;
  pool.forEach((count) => {
    total += count;
  });
  return total;
}

function countByType(pool, targetType) {
  let count = 0;
  PRODUCTS.forEach((product) => {
    if (product.type === targetType) {
      count += pool.get(product.id) ?? 0;
    }
  });
  return count;
}

function canApplyDrinkTrio(pool) {
  return totalItems(pool) >= 3 && countByType(pool, 'drink') >= 1;
}

function popFirst(pool, predicate) {
  for (const product of PRODUCTS) {
    if (!predicate(product)) continue;
    const current = pool.get(product.id) ?? 0;
    if (current > 0) {
      if (current === 1) {
        pool.delete(product.id);
      } else {
        pool.set(product.id, current - 1);
      }
      return product.id;
    }
  }
  throw new Error('在庫が不足しているためセットを形成できません。');
}

function requireItems(pool, count, predicate) {
  const removed = [];
  for (let i = 0; i < count; i += 1) {
    removed.push(popFirst(pool, predicate));
  }
  return removed;
}

function consumeDrinkTrio(pool) {
  requireItems(pool, 1, (product) => product.type === 'drink');
  requireItems(pool, 2, () => true);
}

function consumeFoodTrio(pool) {
  requireItems(pool, 3, (product) => product.type === 'food');
}

function consumeAnyPair(pool) {
  requireItems(pool, 2, () => true);
}

function gatherOrder() {
  const order = {};
  const inputs = form.querySelectorAll('input[data-product-id]');

  inputs.forEach((input) => {
    const value = Number.parseInt(input.value, 10);
    const quantity = Number.isNaN(value) ? 0 : Math.max(0, value);
    if (quantity > 0) {
      order[input.dataset.productId] = quantity;
    }
  });

  return order;
}

function formatCurrency(value) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function updateResults(result) {
  subtotalEl.textContent = formatCurrency(result.subtotal);
  discountEl.textContent = `-${formatCurrency(result.discount)}`;
  finalEl.textContent = formatCurrency(result.final);

  appliedSetsEl.innerHTML = '';
  const summarizedSets = summarizeAppliedSets(result.applied_sets);
  if (summarizedSets.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = '適用されたセットはありません。';
    appliedSetsEl.appendChild(empty);
  } else {
    summarizedSets.forEach((setName) => {
      const li = document.createElement('li');
      li.textContent = setName;
      appliedSetsEl.appendChild(li);
    });
  }
}

function resetResults() {
  subtotalEl.textContent = '0円';
  discountEl.textContent = '-0円';
  finalEl.textContent = '0円';
  appliedSetsEl.innerHTML = '<li class="empty">まだ計算が行われていません。</li>';
}

function saveOrder(order) {
  if (!safeStorage) return;
  try {
    if (Object.keys(order).length === 0) {
      safeStorage.removeItem(STORAGE_KEY_ORDER);
    } else {
      safeStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(order));
    }
  } catch (error) {
    console.warn('保存に失敗しました:', error);
  }
}

function loadSavedOrder() {
  if (!safeStorage) return {};
  try {
    const raw = safeStorage.getItem(STORAGE_KEY_ORDER);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('保存データの読み込みに失敗しました:', error);
    return {};
  }
}

function applyOrderToInputs(order) {
  const inputs = form.querySelectorAll('input[data-product-id]');
  inputs.forEach((input) => {
    const value = order[input.dataset.productId] ?? 0;
    input.value = value;
  });
}

function restoreOrder() {
  const order = loadSavedOrder();
  applyOrderToInputs(order);
  if (Object.keys(order).length > 0) {
    const result = calculateTotals(order);
    updateResults(result);
  } else {
    resetResults();
  }
}

function handleSubmit(event) {
  event.preventDefault();
  const order = gatherOrder();
  if (Object.keys(order).length === 0) {
    resetResults();
    return;
  }
  saveOrder(order);
  const result = calculateTotals(order);
  updateResults(result);
  addHistoryEntry(order, result);
}

function handleQuantityInput(event) {
  const target = event.target;
  if (!target.matches('input[data-product-id]')) {
    return;
  }
  const order = gatherOrder();
  saveOrder(order);
}

function handleQuantityButtons(event) {
  const button = event.target.closest('button.quantity-btn');
  if (!button) return;
  event.preventDefault();
  const { productId, adjust } = button.dataset;
  if (!productId || !adjust) return;

  const input = form.querySelector(`input[data-product-id="${productId}"]`);
  if (!input) return;
  const current = Number.parseInt(input.value, 10) || 0;
  const next = Math.max(0, current + Number.parseInt(adjust, 10));
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function summarizeAppliedSets(appliedSets) {
  const counts = new Map();
  appliedSets.forEach((name) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return Array.from(counts.entries()).map(([name, count]) =>
    count > 1 ? `${name} ×${count}` : name,
  );
}

function addHistoryEntry(order, result) {
  const entry = {
    timestamp: new Date().toISOString(),
    order,
    subtotal: result.subtotal,
    discount: result.discount,
    final: result.final,
    appliedSets: result.applied_sets,
  };
  historyEntries = [entry, ...historyEntries].slice(0, MAX_HISTORY);
  saveHistory(historyEntries);
  renderHistory();
}

function renderHistory() {
  historyListEl.innerHTML = '';
  if (historyEntries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'まだ履歴がありません。';
    historyListEl.appendChild(empty);
    return;
  }

  historyEntries.forEach((entry) => {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'meta';
    const date = new Date(entry.timestamp);
    meta.innerHTML = `<span>${date.toLocaleString('ja-JP')}</span><span>${formatCurrency(
      entry.final,
    )}</span>`;

    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.textContent = `小計 ${formatCurrency(entry.subtotal)} / 割引 -${formatCurrency(
      entry.discount,
    )}`;

    const sets = document.createElement('div');
    sets.className = 'sets';
    const summarizedSets = summarizeAppliedSets(entry.appliedSets);
    sets.textContent =
      summarizedSets.length > 0
        ? summarizedSets.join('、')
        : '適用されたセットはありません';

    const orderJson = document.createElement('div');
    orderJson.className = 'order-json';
    orderJson.textContent = JSON.stringify(entry.order);

    li.append(meta, summary, sets, orderJson);
    historyListEl.appendChild(li);
  });
}

function saveHistory(history) {
  if (!safeStorage) return;
  try {
    safeStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch (error) {
    console.warn('履歴の保存に失敗しました:', error);
  }
}

function loadHistory() {
  if (!safeStorage) return [];
  try {
    const raw = safeStorage.getItem(STORAGE_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('履歴データの読み込みに失敗しました:', error);
    return [];
  }
}

function exportHistoryCsv() {
  if (historyEntries.length === 0) {
    alert('履歴がありません。');
    return;
  }
  const header = [
    'timestamp',
    'subtotal',
    'discount',
    'final',
    'applied_sets',
    'order',
  ];
  const rows = historyEntries.map((entry) => [
    entry.timestamp,
    entry.subtotal,
    entry.discount,
    entry.final,
    summarizeAppliedSets(entry.appliedSets).join(' / '),
    JSON.stringify(entry.order),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `festival-history-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function clearHistory() {
  if (!window.confirm('履歴をすべて削除しますか？')) return;
  historyEntries = [];
  saveHistory(historyEntries);
  renderHistory();
}

function init() {
  restoreOrder();
  historyEntries = loadHistory();
  renderHistory();
  form.addEventListener('submit', handleSubmit);
  form.addEventListener('input', handleQuantityInput);
  form.addEventListener('click', handleQuantityButtons);
  resetBtn.addEventListener('click', () => {
    saveOrder({});
    setTimeout(resetResults, 0);
  });
  exportHistoryBtn.addEventListener('click', exportHistoryCsv);
  clearHistoryBtn.addEventListener('click', clearHistory);
}

init();
