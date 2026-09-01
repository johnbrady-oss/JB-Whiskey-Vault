import DB from './db.js';
import { Scanner, lookupBarcode } from './scanner.js';
import { scanLabelImage } from './ocr.js';

const $app = document.getElementById('app');

const STATUSES = [
  { id: 'sealed', label: 'Sealed' },
  { id: 'open', label: 'Open' },
  { id: 'finished', label: 'Finished' },
  { id: 'gifted', label: 'Gifted / Traded' },
];

const CATEGORIES = [
  'Single Malt', 'Single Pot Still', 'Single Grain',
  'Blended Whiskey', 'Blended Pot Still', 'Poitín', 'Other',
];

let state = {
  view: 'collection', // collection | form | detail | scan | stats | settings
  bottles: [],
  filterStatus: 'all',
  search: '',
  editingId: null,
  detailId: null,
  pendingBarcode: null, // set when arriving at 'form' from a scan
};

function toast(msg, ms = 2400) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function money(n) {
  if (n === undefined || n === null || n === '') return '—';
  return '$' + Number(n).toFixed(2);
}

async function refreshBottles() {
  state.bottles = await DB.all();
}

function filteredBottles() {
  let list = state.bottles;
  if (state.filterStatus !== 'all') list = list.filter((b) => b.status === state.filterStatus);
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter((b) =>
      (b.name || '').toLowerCase().includes(q) ||
      (b.distillery || '').toLowerCase().includes(q) ||
      (b.category || '').toLowerCase().includes(q)
    );
  }
  return list;
}

// ---------- Rendering ----------

function render() {
  switch (state.view) {
    case 'collection': return renderCollection();
    case 'form': return renderForm();
    case 'detail': return renderDetail();
    case 'stats': return renderStats();
    case 'settings': return renderSettings();
    default: return renderCollection();
  }
}

function shell(contentHtml, activeTab) {
  $app.innerHTML = `
    <header class="topbar">
      <div>
        <h1>🥃 Whiskey Vault</h1>
        <div class="sub">${state.bottles.length} bottle${state.bottles.length === 1 ? '' : 's'} in your collection</div>
      </div>
      <button class="icon-btn" id="btn-scan-top">▦</button>
    </header>
    <main id="main">${contentHtml}</main>
    <button class="fab" id="fab-add">+</button>
    <nav class="tabbar">
      <button data-tab="collection" class="${activeTab === 'collection' ? 'active' : ''}"><span class="glyph">🍾</span>Collection</button>
      <button data-tab="scan" class="${activeTab === 'scan' ? 'active' : ''}"><span class="glyph">📷</span>Scan</button>
      <button data-tab="stats" class="${activeTab === 'stats' ? 'active' : ''}"><span class="glyph">📊</span>Stats</button>
      <button data-tab="settings" class="${activeTab === 'settings' ? 'active' : ''}"><span class="glyph">⚙️</span>Settings</button>
    </nav>
  `;
  document.getElementById('btn-scan-top').onclick = openScanner;
  document.getElementById('fab-add').onclick = () => { state.editingId = null; state.pendingBarcode = null; setView('form'); };
  $app.querySelectorAll('.tabbar button').forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      if (tab === 'scan') return openScanner();
      setView(tab);
    };
  });
}

function renderCollection() {
  const list = filteredBottles();
  const chips = [{ id: 'all', label: 'All' }, ...STATUSES];

  const rows = list.length ? list.map(bottleRow).join('') : `
    <div class="empty-state">
      <div class="big">🥃</div>
      <div>${state.bottles.length === 0
        ? 'No bottles yet. Scan one or add it by hand to get started.'
        : 'No bottles match this filter.'}</div>
    </div>
  `;

  shell(`
    <div class="search-row">
      <input id="search-input" placeholder="Search name, distillery, category…" value="${esc(state.search)}" />
    </div>
    <div class="filter-chips">
      ${chips.map((c) => `<div class="chip ${state.filterStatus === c.id ? 'active' : ''}" data-status="${c.id}">${c.label}</div>`).join('')}
    </div>
    ${rows}
  `, 'collection');

  document.getElementById('search-input').oninput = (e) => { state.search = e.target.value; renderCollection(); };
  $app.querySelectorAll('.chip').forEach((chip) => {
    chip.onclick = () => { state.filterStatus = chip.dataset.status; renderCollection(); };
  });
  $app.querySelectorAll('.bottle-card').forEach((card) => {
    card.onclick = () => { state.detailId = card.dataset.id; setView('detail'); };
  });
}

function bottleRow(b) {
  const fillNote = b.status === 'open' && b.fillLevel != null ? ` · ${b.fillLevel}% full` : '';
  return `
    <div class="bottle-card" data-id="${b.id}">
      <div class="bottle-thumb">${b.photo ? `<img src="${b.photo}" />` : '🥃'}</div>
      <div class="bottle-info">
        <div class="name">${esc(b.name || 'Unnamed bottle')}</div>
        <div class="meta">${esc(b.distillery || '')}${b.distillery && b.category ? ' · ' : ''}${esc(b.category || '')}${fillNote}</div>
      </div>
      <div class="status-pill status-${b.status || 'sealed'}">${(STATUSES.find((s) => s.id === b.status) || STATUSES[0]).label}</div>
    </div>
  `;
}

function renderForm() {
  const editing = state.editingId ? state.bottles.find((b) => b.id === state.editingId) : null;
  const b = editing || {
    barcode: state.pendingBarcode || '',
    name: '', distillery: '', category: CATEGORIES[0],
    age: '', abv: '', volume: 700, purchaseDate: '', purchasePrice: '',
    currentValue: '', status: 'sealed', fillLevel: 100, rating: '', notes: '', photo: null,
  };

  shell(`
    <div class="field">
      <label>Photo</label>
      <div class="detail-photo" id="photo-preview">${b.photo ? `<img src="${b.photo}" />` : '📷 Tap to add a photo'}</div>
      <input type="file" accept="image/*" capture="environment" id="photo-input" style="display:none" />
      <button class="btn secondary" id="btn-read-label" style="display:${b.photo ? 'block' : 'none'}">🔎 Read label & fill fields in</button>
      <div id="ocr-status" style="display:none; text-align:center; color:var(--muted); font-size:13px; margin-top:8px;"></div>
      <details id="ocr-raw-wrap" style="display:none; margin-top:8px;">
        <summary style="color:var(--muted); font-size:12.5px; cursor:pointer;">Show raw scanned text</summary>
        <div id="ocr-raw" style="white-space:pre-wrap; font-size:12px; color:var(--muted); margin-top:6px; font-family: ui-monospace, monospace;"></div>
      </details>
    </div>

    <div class="field">
      <label>Barcode</label>
      <div class="field-row">
        <input id="f-barcode" value="${esc(b.barcode)}" placeholder="Scanned or typed code" />
        <button class="btn secondary" id="btn-rescan" style="width:auto; padding:11px 16px; margin-top:0;">Scan</button>
      </div>
    </div>

    <div class="field">
      <label>Name</label>
      <input id="f-name" value="${esc(b.name)}" placeholder="e.g. Redbreast 12 Year" />
    </div>

    <div class="field-row">
      <div class="field">
        <label>Distillery / Brand</label>
        <input id="f-distillery" value="${esc(b.distillery)}" placeholder="e.g. Midleton" />
      </div>
      <div class="field">
        <label>Category</label>
        <select id="f-category">
          ${CATEGORIES.map((c) => `<option ${c === b.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Age statement</label>
        <input id="f-age" value="${esc(b.age)}" placeholder="e.g. 12 Year / NAS" />
      </div>
      <div class="field">
        <label>ABV %</label>
        <input id="f-abv" type="number" step="0.1" value="${esc(b.abv)}" placeholder="e.g. 40" />
      </div>
    </div>

    <div class="field">
      <label>Volume (ml)</label>
      <input id="f-volume" type="number" value="${esc(b.volume)}" />
    </div>

    <div class="field-row">
      <div class="field">
        <label>Purchase date</label>
        <input id="f-purchaseDate" type="date" value="${esc(b.purchaseDate)}" />
      </div>
      <div class="field">
        <label>Price paid</label>
        <input id="f-purchasePrice" type="number" step="0.01" value="${esc(b.purchasePrice)}" />
      </div>
    </div>

    <div class="field">
      <label>Current estimated value (optional)</label>
      <input id="f-currentValue" type="number" step="0.01" value="${esc(b.currentValue)}" />
    </div>

    <div class="field">
      <label>Status</label>
      <select id="f-status">
        ${STATUSES.map((s) => `<option value="${s.id}" ${s.id === b.status ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
    </div>

    <div class="field" id="fill-field" style="display:${b.status === 'open' ? 'block' : 'none'}">
      <label>Fill level</label>
      <div class="fill-slider-row">
        <input id="f-fillLevel" type="range" min="0" max="100" value="${b.fillLevel ?? 100}" />
        <div class="fill-value" id="fill-value-label">${b.fillLevel ?? 100}%</div>
      </div>
    </div>

    <div class="field">
      <label>Rating (1–10)</label>
      <input id="f-rating" type="number" min="1" max="10" value="${esc(b.rating)}" />
    </div>

    <div class="field">
      <label>Tasting notes</label>
      <textarea id="f-notes" placeholder="Nose, palate, finish…">${esc(b.notes)}</textarea>
    </div>

    <button class="btn" id="btn-save">${editing ? 'Save changes' : 'Add to collection'}</button>
    <button class="btn secondary" id="btn-cancel">Cancel</button>
  `, 'collection');

  let photoData = b.photo || null;
  let lastPhotoFile = null;

  document.getElementById('photo-preview').onclick = () => document.getElementById('photo-input').click();
  document.getElementById('photo-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lastPhotoFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      photoData = reader.result;
      document.getElementById('photo-preview').innerHTML = `<img src="${photoData}" />`;
      document.getElementById('btn-read-label').style.display = 'block';
    };
    reader.readAsDataURL(file);
  };

  document.getElementById('btn-read-label').onclick = async () => {
    const btn = document.getElementById('btn-read-label');
    const statusEl = document.getElementById('ocr-status');
    btn.disabled = true;
    btn.textContent = 'Reading label…';
    statusEl.style.display = 'block';
    statusEl.textContent = 'This can take 10–20 seconds the first time, while the text reader loads.';
    try {
      const parsed = await scanLabelImage(lastPhotoFile || photoData);
      const nameEl = document.getElementById('f-name');
      const abvEl = document.getElementById('f-abv');
      const volEl = document.getElementById('f-volume');
      const ageEl = document.getElementById('f-age');
      const catEl = document.getElementById('f-category');
      if (parsed.name && !nameEl.value.trim()) nameEl.value = parsed.name;
      if (parsed.abv && !abvEl.value.trim()) abvEl.value = parsed.abv;
      if (parsed.volumeMl && String(volEl.value) === '700') volEl.value = parsed.volumeMl;
      if (parsed.age && !ageEl.value.trim()) ageEl.value = parsed.age;
      if (parsed.category) catEl.value = parsed.category;

      const rawWrap = document.getElementById('ocr-raw-wrap');
      document.getElementById('ocr-raw').textContent = parsed.rawText.trim() || '(no text detected)';
      rawWrap.style.display = 'block';

      statusEl.textContent = 'Done — double-check the fields above, especially name and distillery.';
      setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
    } catch (err) {
      statusEl.textContent = 'Could not read the label (needs an internet connection the first time). You can still fill fields in by hand.';
    } finally {
      btn.disabled = false;
      btn.textContent = '🔎 Read label & fill fields in';
    }
  };

  document.getElementById('f-status').onchange = (e) => {
    document.getElementById('fill-field').style.display = e.target.value === 'open' ? 'block' : 'none';
  };
  document.getElementById('f-fillLevel').oninput = (e) => {
    document.getElementById('fill-value-label').textContent = e.target.value + '%';
  };

  document.getElementById('btn-rescan').onclick = () => openScanner({ intoForm: true });
  document.getElementById('btn-cancel').onclick = () => setView(editing ? 'detail' : 'collection');

  document.getElementById('btn-save').onclick = async () => {
    const record = {
      id: editing ? editing.id : undefined,
      barcode: document.getElementById('f-barcode').value.trim(),
      name: document.getElementById('f-name').value.trim(),
      distillery: document.getElementById('f-distillery').value.trim(),
      category: document.getElementById('f-category').value,
      age: document.getElementById('f-age').value.trim(),
      abv: document.getElementById('f-abv').value,
      volume: document.getElementById('f-volume').value,
      purchaseDate: document.getElementById('f-purchaseDate').value,
      purchasePrice: document.getElementById('f-purchasePrice').value,
      currentValue: document.getElementById('f-currentValue').value,
      status: document.getElementById('f-status').value,
      fillLevel: Number(document.getElementById('f-fillLevel').value),
      rating: document.getElementById('f-rating').value,
      notes: document.getElementById('f-notes').value,
      photo: photoData,
      dateAdded: editing ? editing.dateAdded : undefined,
    };
    if (!record.name) { toast('Give the bottle a name first'); return; }
    const saved = await DB.save(record);
    await refreshBottles();
    state.detailId = saved.id;
    state.editingId = null;
    state.pendingBarcode = null;
    setView('detail');
    toast('Saved');
  };
}

function renderDetail() {
  const b = state.bottles.find((x) => x.id === state.detailId);
  if (!b) { setView('collection'); return; }

  shell(`
    <div class="detail-photo">${b.photo ? `<img src="${b.photo}" />` : '🥃'}</div>
    <h2 style="margin:0 0 4px;">${esc(b.name)}</h2>
    <div style="color:var(--muted); margin-bottom:14px;">${esc(b.distillery || '')}${b.distillery && b.category ? ' · ' : ''}${esc(b.category || '')}</div>

    <div class="stat-grid">
      <div class="stat-card"><div class="value">${esc(b.age) || '—'}</div><div class="label">Age statement</div></div>
      <div class="stat-card"><div class="value">${b.abv ? b.abv + '%' : '—'}</div><div class="label">ABV</div></div>
      <div class="stat-card"><div class="value">${money(b.purchasePrice)}</div><div class="label">Paid</div></div>
      <div class="stat-card"><div class="value">${money(b.currentValue)}</div><div class="label">Est. value</div></div>
    </div>

    <div class="section-title">Status</div>
    <div class="status-pill status-${b.status || 'sealed'}" style="display:inline-block; margin-bottom:14px;">
      ${(STATUSES.find((s) => s.id === b.status) || STATUSES[0]).label}
    </div>
    ${b.status === 'open' ? `
      <div class="fill-slider-row" style="margin-bottom:14px;">
        <input id="quick-fill" type="range" min="0" max="100" value="${b.fillLevel ?? 100}" />
        <div class="fill-value">${b.fillLevel ?? 100}%</div>
      </div>
    ` : ''}

    ${b.rating ? `<div class="section-title">Rating</div><div style="margin-bottom:14px;">⭐ ${esc(b.rating)}/10</div>` : ''}

    ${b.notes ? `<div class="section-title">Tasting notes</div><div style="margin-bottom:14px; white-space:pre-wrap;">${esc(b.notes)}</div>` : ''}

    <div class="section-title">Barcode</div>
    <div style="margin-bottom:6px; font-family: ui-monospace, monospace;">${esc(b.barcode) || 'None assigned'}</div>
    <button class="btn secondary" id="btn-label">${b.barcode ? 'Print label again' : 'Generate & print a label'}</button>

    <div class="section-title">Purchased</div>
    <div style="margin-bottom:14px;">${b.purchaseDate ? new Date(b.purchaseDate + 'T00:00:00').toLocaleDateString() : '—'}</div>

    <button class="btn" id="btn-edit">Edit</button>
    <button class="btn danger" id="btn-delete">Delete bottle</button>
    <button class="btn secondary" id="btn-back">Back to collection</button>
  `, 'collection');

  const quickFill = document.getElementById('quick-fill');
  if (quickFill) {
    quickFill.onchange = async (e) => {
      b.fillLevel = Number(e.target.value);
      await DB.save(b);
      await refreshBottles();
      renderDetail();
    };
  }

  document.getElementById('btn-label').onclick = () => showLabelModal(b);
  document.getElementById('btn-edit').onclick = () => { state.editingId = b.id; setView('form'); };
  document.getElementById('btn-back').onclick = () => setView('collection');
  document.getElementById('btn-delete').onclick = async () => {
    if (!confirm(`Delete "${b.name}"? This can't be undone.`)) return;
    await DB.remove(b.id);
    await refreshBottles();
    setView('collection');
    toast('Bottle deleted');
  };
}

function showLabelModal(b) {
  let code = b.barcode;
  const isNew = !code;
  if (isNew) {
    code = 'WV-' + b.id.slice(0, 8).toUpperCase();
  }
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(code)}`;

  const modal = document.createElement('div');
  modal.className = 'qr-modal';
  modal.innerHTML = `
    <div class="qr-modal-content">
      <img src="${qrUrl}" alt="QR label" />
      <div class="barcode-text">${esc(code)}</div>
      <div class="bottle-name-print">${esc(b.name)}</div>
      <button class="btn" id="btn-close-label" style="margin-top:16px;">Close</button>
      <div style="font-size:11px; color:#666; margin-top:10px;">
        Screenshot or print this, stick it on the bottle, then scan it any time to pull this bottle straight up.
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('btn-close-label').onclick = async () => {
    if (isNew) {
      b.barcode = code;
      await DB.save(b);
      await refreshBottles();
      renderDetail();
    }
    modal.remove();
  };
}

function renderStats() {
  const list = state.bottles;
  const total = list.length;
  const totalPaid = list.reduce((s, b) => s + (Number(b.purchasePrice) || 0), 0);
  const totalValue = list.reduce((s, b) => s + (Number(b.currentValue) || Number(b.purchasePrice) || 0), 0);
  const open = list.filter((b) => b.status === 'open').length;
  const sealed = list.filter((b) => b.status === 'sealed').length;
  const finished = list.filter((b) => b.status === 'finished').length;
  const avgRating = (() => {
    const rated = list.filter((b) => b.rating);
    if (!rated.length) return null;
    return (rated.reduce((s, b) => s + Number(b.rating), 0) / rated.length).toFixed(1);
  })();

  const byDistillery = {};
  list.forEach((b) => {
    const key = b.distillery || 'Unknown';
    byDistillery[key] = (byDistillery[key] || 0) + 1;
  });
  const topDistilleries = Object.entries(byDistillery).sort((a, b) => b[1] - a[1]).slice(0, 6);

  shell(`
    <div class="stat-grid">
      <div class="stat-card"><div class="value">${total}</div><div class="label">Total bottles</div></div>
      <div class="stat-card"><div class="value">${money(totalPaid)}</div><div class="label">Total invested</div></div>
      <div class="stat-card"><div class="value">${money(totalValue)}</div><div class="label">Est. collection value</div></div>
      <div class="stat-card"><div class="value">${avgRating ?? '—'}</div><div class="label">Average rating</div></div>
    </div>

    <div class="section-title">By status</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="value">${sealed}</div><div class="label">Sealed</div></div>
      <div class="stat-card"><div class="value">${open}</div><div class="label">Open</div></div>
      <div class="stat-card"><div class="value">${finished}</div><div class="label">Finished</div></div>
      <div class="stat-card"><div class="value">${list.filter((b) => b.status === 'gifted').length}</div><div class="label">Gifted / Traded</div></div>
    </div>

    <div class="section-title">Top distilleries</div>
    ${topDistilleries.length ? topDistilleries.map(([name, count]) => `
      <div class="bottle-card" style="cursor:default;">
        <div class="bottle-info"><div class="name">${esc(name)}</div></div>
        <div class="status-pill status-sealed">${count}</div>
      </div>
    `).join('') : '<div class="empty-state">Add some bottles to see breakdowns here.</div>'}
  `, 'stats');
}

function renderSettings() {
  shell(`
    <div class="section-title">Backup & restore</div>
    <div style="color:var(--muted); font-size:13.5px; margin-bottom:12px;">
      Your collection is stored only on this device, in this browser. It is not backed up
      automatically. Export a backup regularly, especially before offloading the app or
      clearing Safari data.
    </div>
    <button class="btn" id="btn-export">Export backup (JSON)</button>
    <input type="file" id="import-input" accept="application/json" style="display:none" />
    <button class="btn secondary" id="btn-import">Import backup</button>

    <div class="section-title">About</div>
    <div style="color:var(--muted); font-size:13.5px; line-height:1.6;">
      Whiskey Vault is a personal collection tracker. Scan a bottle's existing retail
      barcode, or generate your own printable label for bottles that don't have one —
      either way, the barcode is remembered on this device so scanning it again always
      pulls up the same bottle instantly.
      <br /><br />
      Everything works offline once loaded. Barcode lookup for retail bottles needs a
      connection and isn't always available, since many distilleries aren't in public
      product databases — you can always fill details in by hand.
    </div>
  `, 'settings');

  document.getElementById('btn-export').onclick = async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whiskey-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  };

  document.getElementById('btn-import').onclick = () => document.getElementById('import-input').click();
  document.getElementById('import-input').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const merge = confirm('Merge with your current collection? Cancel to replace it entirely instead.');
      const count = await DB.importAll(payload, { replace: !merge });
      await refreshBottles();
      toast(`Imported ${count} bottle${count === 1 ? '' : 's'}`);
      setView('collection');
    } catch (err) {
      toast('Could not read that backup file');
    }
  };
}

// ---------- Scanner overlay ----------

async function openScanner({ intoForm = false } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'scan-view';
  overlay.innerHTML = `
    <div class="scan-header">
      <button class="icon-btn" id="btn-close-scan">✕</button>
    </div>
    <video autoplay playsinline muted></video>
    <div class="scan-overlay"></div>
    <div class="scan-hint">Center the barcode in the frame — retail label or your own printed one</div>
    <div class="scan-manual">
      <div class="field-row">
        <input id="manual-barcode" placeholder="…or type the code in by hand" />
        <button class="btn" id="btn-manual-go" style="width:auto; padding:12px 18px; margin-top:0;">Go</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const video = overlay.querySelector('video');

  let handled = false;
  const finish = async (code) => {
    if (handled) return;
    handled = true;
    Scanner.stop();
    overlay.remove();
    await handleScannedCode(code, { intoForm });
  };

  document.getElementById('btn-close-scan').onclick = () => {
    handled = true;
    Scanner.stop();
    overlay.remove();
  };
  document.getElementById('btn-manual-go').onclick = () => {
    const v = document.getElementById('manual-barcode').value.trim();
    if (v) finish(v);
  };

  try {
    await Scanner.start(video, (text) => finish(text), (err) => {
      console.warn('Scanner error', err);
    });
  } catch (err) {
    toast('Camera access denied or unavailable — you can still type the code in.');
  }
}

async function handleScannedCode(code, { intoForm }) {
  if (intoForm && state.view === 'form') {
    document.getElementById('f-barcode').value = code;
    toast('Barcode captured');
    return;
  }

  const existing = await DB.findByBarcode(code);
  if (existing) {
    await refreshBottles();
    state.detailId = existing.id;
    setView('detail');
    toast(`Found: ${existing.name}`);
    return;
  }

  toast('New barcode — looking it up…');
  state.editingId = null;
  state.pendingBarcode = code;
  setView('form');

  const info = await lookupBarcode(code);
  if (info && (info.name || info.brand)) {
    const nameEl = document.getElementById('f-name');
    const distEl = document.getElementById('f-distillery');
    if (nameEl && !nameEl.value) nameEl.value = info.name || '';
    if (distEl && !distEl.value) distEl.value = info.brand || '';
    toast('Pre-filled from a product lookup — check it over');
  }
}

// ---------- View switching ----------

function setView(view) {
  state.view = view;
  render();
}

// ---------- Boot ----------

async function boot() {
  await refreshBottles();
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
