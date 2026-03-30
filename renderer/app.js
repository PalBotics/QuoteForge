const api = window.quoteForgeApi;

const SERVICES = [
  'Mechanical Design',
  'Design Concept',
  'Electronics / PCB Design',
  'CAD Modeling (SolidWorks)',
  'Prototyping',
  'Engineering Documentation',
  'Testing Plan',
  'Design Reviews & Revisions',
  'Site Visit / Travel',
  'Repair & Modification',
  'BOM Creation',
  'Other'
];

const STATUS_OPTIONS = ['Draft', 'Sent', 'Accepted', 'Closed'];
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const QUOTE_STYLE = `
  body { margin: 0; background: #f5f7fb; }
  .quote-doc { font-family: Georgia, "Times New Roman", serif; color: #172033; line-height: 1.35; max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #d9dee5; }
  .quote-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 10px; }
  .quote-logo { width: 200px; max-height: 100px; object-fit: contain; }
  .quote-id { color: #042c53; font-weight: bold; font-size: 24px; }
  .quote-rule { border: 0; border-top: 4px solid #042c53; margin: 0; }
  .quote-body { padding: 16px 20px 20px; }
  .quote-tc { border-left: 4px solid #042c53; background: #f9fbfd; padding: 10px 12px; }
  .quote-footer { background: #042c53; color: #fff; text-align: center; padding: 10px; font-size: 13px; }
  .table { width: 100%; border-collapse: collapse; }
  .table th, .table td { border: 1px solid #d9dee5; padding: 8px; font-size: 14px; }
  .table th { background: #042c53; color: #fff; }
  .table tr:nth-child(even) td { background: #f8fafc; }
  .right { text-align: right; }
`;

const DEFAULT_RATE_SCHEDULE = [
  { category: 'Design & Engineering', activity: 'Mechanical Design', rate: 125 },
  { category: 'Design & Engineering', activity: 'Design Concept Development', rate: 125 },
  { category: 'Design & Engineering', activity: 'Electronics / PCB Design', rate: 135 },
  { category: 'Design & Engineering', activity: 'FEA / Structural Analysis', rate: 135 },
  { category: 'Design & Engineering', activity: 'Systems Integration', rate: 125 },
  { category: 'CAD & Drafting', activity: 'SolidWorks 3D Modeling', rate: 115 },
  { category: 'CAD & Drafting', activity: 'Detail Drawing / Drafting', rate: 100 },
  { category: 'CAD & Drafting', activity: 'Assembly Drawing', rate: 110 },
  { category: 'CAD & Drafting', activity: 'Drawing Revisions', rate: 100 },
  { category: 'Prototyping', activity: 'Prototyping — Design & Oversight', rate: 125 },
  { category: 'Prototyping', activity: 'Fabrication (Shop Work)', rate: 95 },
  { category: 'Prototyping', activity: 'Prototype Testing', rate: 115 },
  { category: 'Documentation', activity: 'Engineering Documentation', rate: 100 },
  { category: 'Documentation', activity: 'Technical Writing', rate: 95 },
  { category: 'Documentation', activity: 'Illustrated Instructions', rate: 105 },
  { category: 'Documentation', activity: 'BOM Creation', rate: 95 },
  { category: 'Documentation', activity: 'Testing Plan Development', rate: 115 },
  { category: 'Project Management', activity: 'Client Consultation', rate: 125 },
  { category: 'Project Management', activity: 'Design Review', rate: 125 },
  { category: 'Project Management', activity: 'Project Management', rate: 115 },
  { category: 'Site & Travel', activity: 'Site Visit (day rate, flat)', rate: 1500 },
  { category: 'Site & Travel', activity: 'Site Assessment / Survey', rate: 125 },
  { category: 'Site & Travel', activity: 'Travel Time (portal to portal)', rate: 75 },
];

const state = {
  data: null,
  selectedSection: 'newQuote',
  quoteNumber: '',
  projectForm: null,
  chatMessages: [],
  readyQuotePayload: null,
  quotePreviewClient: null,
  logoPath: '',
  hasApiKey: false,
  selectedHistoryQuoteId: null,
  editingClientId: null,
  terms: '',
  rateSchedule: [],
  draftRestored: false,
};

function escapeHtml(input) {
  const text = `${input ?? ''}`;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function saveDraft() {
  try {
    const draft = {
      quoteNumber: state.quoteNumber,
      projectForm: state.projectForm,
      chatMessages: state.chatMessages,
      readyQuotePayload: state.readyQuotePayload
    };
    localStorage.setItem('quoteDraft', JSON.stringify(draft));
  } catch (e) {}
}

function clearDraft() {
  try { localStorage.removeItem('quoteDraft'); } catch (e) {}
}

function tryRestoreDraft() {
  if (state.draftRestored) return;
  try {
    const raw = localStorage.getItem('quoteDraft');
    if (raw) {
      const draft = JSON.parse(raw);
      if (draft && (draft.projectForm || draft.readyQuotePayload)) {
        if (confirm('A previous quote draft was found. Would you like to recover it?')) {
          state.quoteNumber = draft.quoteNumber || '';
          state.projectForm = draft.projectForm || null;
          state.chatMessages = draft.chatMessages || [];
          state.readyQuotePayload = draft.readyQuotePayload || null;
          state.selectedSection = 'newQuote';
          state.draftRestored = true;
        } else {
          clearDraft();
        }
      }
    }
  } catch (e) {}
}

function money(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v || 0));
}

function todayIso() {
  const d = new Date();
  const yyyy = `${d.getFullYear()}`;
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(baseIso, days) {
  const d = new Date(baseIso);
  d.setDate(d.getDate() + Number(days || 0));
  const yyyy = `${d.getFullYear()}`;
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatCityStateZip(city, stateName, zip) {
  const cityState = [city, stateName].filter(Boolean).join(', ');
  return [cityState, zip].filter(Boolean).join(' ');
}

function normalizeClientContact(client = {}) {
  return {
    ...client,
    email: client.email || '',
    address1: client.address1 || client.address || '',
    address2: client.address2 || '',
    city: client.city || '',
    state: client.state || '',
    zip: client.zip || ''
  };
}

function clientAddressLines(client = {}) {
  const normalized = normalizeClientContact(client);
  const cityStateZip = formatCityStateZip(normalized.city, normalized.state, normalized.zip);
  return [normalized.address1, normalized.address2, cityStateZip].filter((line) => line && line.trim());
}

function formatPhoneNumber(value) {
  const digits = `${value || ''}`.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidEmail(value) {
  const email = `${value || ''}`.trim();
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeText(value) {
  return `${value || ''}`.trim().toLowerCase();
}

function isDuplicateClientEntry(clients, candidate, excludeId = '') {
  const name = normalizeText(candidate.name);
  const company = normalizeText(candidate.company);
  const email = normalizeText(candidate.email);

  return (clients || []).some((existing) => {
    if (excludeId && existing.id === excludeId) {
      return false;
    }

    const existingEmail = normalizeText(existing.email);
    if (email && existingEmail && email === existingEmail) {
      return true;
    }

    const existingName = normalizeText(existing.name);
    const existingCompany = normalizeText(existing.company);
    return Boolean(name) && existingName === name && existingCompany === company;
  });
}

function stateOptionsMarkup(selected) {
  return `<option value="">Select state</option>${US_STATES.map((abbr) => `<option value="${abbr}" ${selected === abbr ? 'selected' : ''}>${abbr}</option>`).join('')}`;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function recalculateQuotePayload(payload) {
  if (!payload || !Array.isArray(payload.lineItems)) {
    return payload;
  }

  let total = 0;
  payload.lineItems.forEach((item) => {
    if (item.isFixed) {
      item.cost = roundMoney(item.cost);
    } else {
      item.hours = Number(item.hours || 0);
      item.rate = Number(item.rate || 0);
      item.cost = roundMoney(item.hours * item.rate);
    }
    total += Number(item.cost || 0);
  });

  payload.nteTotal = roundMoney(total);
  return payload;
}

function wireNavigation() {
  const nav = document.getElementById('nav-sections');
  nav.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-section]');
    if (!btn) return;
    state.selectedSection = btn.dataset.section;
    renderSections();
  });
}

function renderSections() {
  document.querySelectorAll('#nav-sections button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === state.selectedSection);
  });

  document.querySelectorAll('.section').forEach((el) => {
    el.classList.toggle('active', el.id === `section-${state.selectedSection}`);
  });

  if (state.selectedSection === 'newQuote') {
    renderStep1();
    renderStep2();
    renderStep3();
  } else if (state.selectedSection === 'editQuote') {
    renderEditQuote();
  } else if (state.selectedSection === 'history') {
    renderHistory();
  } else if (state.selectedSection === 'clients') {
    renderClients();
  } else if (state.selectedSection === 'settings') {
    renderSettings();
  } else if (state.selectedSection === 'terms') {
    renderTerms();
  }

// Unified quote editor
function renderEditQuote() {
  const root = document.getElementById('edit-quote-root');
  const form = state.projectForm || {};
  const payload = state.readyQuotePayload || { lineItems: [] };
  const settings = state.data.settings || {};
  root.innerHTML = `
    <div class="card">
      <div class="grid-2">
        <label>Client Name *<input id="edit-client-name" value="${escapeHtml(form.clientName || '')}" /></label>
        <label>Client Title<input id="edit-client-title" value="${escapeHtml(form.clientTitle || '')}" /></label>
        <label>Company<input id="edit-company" value="${escapeHtml(form.company || '')}" /></label>
        <label>Phone<input id="edit-phone" value="${escapeHtml(form.phone || '')}" /></label>
        <label>Email<input id="edit-email" value="${escapeHtml(form.email || '')}" /></label>
        <label>Street Address<input id="edit-address1" value="${escapeHtml(form.address1 || '')}" /></label>
        <label>Suite / Unit<input id="edit-address2" value="${escapeHtml(form.address2 || '')}" /></label>
        <label>City<input id="edit-city" value="${escapeHtml(form.city || '')}" /></label>
        <label>State<select id="edit-state">${stateOptionsMarkup(form.state)}</select></label>
        <label>Zip Code<input id="edit-zip" value="${escapeHtml(form.zip || '')}" /></label>
      </div>
      <div class="grid-2" style="margin-top:10px">
        <label>Project Name / Re: *<input id="edit-project-name" value="${escapeHtml(form.projectName || '')}" /></label>
        <label>Hourly Rate<input id="edit-hourly-rate" type="number" min="1" value="${Number(form.hourlyRate || settings.defaultRate || 125)}" /></label>
        <label>Quote Validity (days)<input id="edit-validity-days" type="number" min="1" value="${Number(form.validityDays || settings.defaultValidity || 30)}" /></label>
        <div></div>
      </div>
      <label style="margin-top:10px">Scope Narrative<textarea id="edit-project-description" style="overflow-y:auto;resize:vertical">${escapeHtml(payload.scopeNarrative || form.projectDescription || '')}</textarea></label>
      <div style="margin-top:10px">
        <div style="color:var(--muted);font-size:13px">Services</div>
        <div class="grid-2" id="edit-services-checks">
          ${SERVICES.map((s) => `
            <label class="service-option"><input type="checkbox" value="${escapeHtml(s)}" ${form.services && form.services.includes(s) ? 'checked' : ''} /><span>${escapeHtml(s)}</span></label>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <div style="font-weight:600;margin-bottom:8px">Edit Quote Line Items</div>
      <table class="table">
        <thead>
          <tr><th>Phase/Task</th><th>Description</th><th class="right">Est. Hrs</th><th class="right">Rate</th><th class="right">Cost</th><th></th></tr>
        </thead>
        <tbody id="edit-line-items-body">
          ${(payload.lineItems || []).map((item, idx) => `
            <tr>
              <td><input class="edit-line-phase" data-idx="${idx}" value="${escapeHtml(item.phase || '')}" /></td>
              <td><input class="edit-line-desc" data-idx="${idx}" value="${escapeHtml(item.description || '')}" /></td>
              <td class="right">${item.isFixed ? '<span class="badge">Fixed</span>' : `<input class="edit-line-hours" data-idx="${idx}" type="number" step="0.5" min="0" value="${Number(item.hours || 0)}" style="max-width:90px" />`}</td>
              <td class="right">${item.isFixed ? '<span class="badge">Fixed</span>' : `<input class="edit-line-rate" data-idx="${idx}" type="number" step="1" min="0" value="${Number(item.rate || 0)}" style="max-width:90px" />`}</td>
              <td class="right">${item.isFixed ? `<input class="edit-line-fixed-cost" data-idx="${idx}" type="number" step="0.01" min="0" value="${Number(item.cost || 0)}" style="max-width:110px" />` : money(item.cost || 0)}</td>
              <td><button class="danger edit-line-remove" data-idx="${idx}" title="Remove">✕</button></td>
            </tr>
          `).join('')}
          <tr>
            <td><input id="add-line-phase" placeholder="Phase/Task" /></td>
            <td><input id="add-line-desc" placeholder="Description" /></td>
            <td class="right"><input id="add-line-hours" type="number" step="0.5" min="0" placeholder="Hrs" style="max-width:90px" /></td>
            <td class="right"><input id="add-line-rate" type="number" step="1" min="0" placeholder="Rate" style="max-width:90px" /></td>
            <td class="right"></td>
            <td><button id="add-line-item" class="secondary">Add</button></td>
          </tr>
          <tr>
            <td colspan="4" style="background:#042c53;color:#fff"><strong>Not-to-Exceed Total</strong></td>
            <td class="right" style="background:#042c53;color:#fff" colspan="2"><strong>${money(payload.nteTotal || 0)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="actions" style="margin-top:12px">
      <button id="edit-save-history" class="primary">Save Changes</button>
      <button id="edit-save-revision" class="secondary">Save as Revision</button>
      <button id="edit-save-new" class="secondary">Save as New</button>
      <button id="edit-cancel" class="secondary">Cancel</button>
    </div>
    <div id="edit-quote-info" style="margin-top:10px;color:var(--muted)"></div>
  `;

  // Field wiring
  root.querySelector('#edit-client-name').addEventListener('input', e => form.clientName = e.target.value);
  root.querySelector('#edit-client-title').addEventListener('input', e => form.clientTitle = e.target.value);
  root.querySelector('#edit-company').addEventListener('input', e => form.company = e.target.value);
  root.querySelector('#edit-phone').addEventListener('input', e => form.phone = e.target.value);
  root.querySelector('#edit-email').addEventListener('input', e => form.email = e.target.value);
  root.querySelector('#edit-address1').addEventListener('input', e => form.address1 = e.target.value);
  root.querySelector('#edit-address2').addEventListener('input', e => form.address2 = e.target.value);
  root.querySelector('#edit-city').addEventListener('input', e => form.city = e.target.value);
  root.querySelector('#edit-state').addEventListener('change', e => form.state = e.target.value);
  root.querySelector('#edit-zip').addEventListener('input', e => form.zip = e.target.value);
  root.querySelector('#edit-project-name').addEventListener('input', e => form.projectName = e.target.value);
  root.querySelector('#edit-hourly-rate').addEventListener('input', e => form.hourlyRate = Number(e.target.value));
  root.querySelector('#edit-validity-days').addEventListener('input', e => form.validityDays = Number(e.target.value));
  const scopeTA = root.querySelector('#edit-project-description');
  const autoResizeScopeTA = () => { scopeTA.style.height = 'auto'; scopeTA.style.height = scopeTA.scrollHeight + 'px'; };
  autoResizeScopeTA();
  scopeTA.addEventListener('input', e => { payload.scopeNarrative = e.target.value; form.projectDescription = e.target.value; autoResizeScopeTA(); });
  root.querySelectorAll('#edit-services-checks input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      form.services = [...root.querySelectorAll('#edit-services-checks input[type="checkbox"]:checked')].map(el => el.value);
    });
  });

  // Line item editing
  root.querySelectorAll('.edit-line-phase').forEach(input => {
    input.addEventListener('input', e => {
      payload.lineItems[Number(input.dataset.idx)].phase = e.target.value;
    });
  });
  root.querySelectorAll('.edit-line-desc').forEach(input => {
    input.addEventListener('input', e => {
      payload.lineItems[Number(input.dataset.idx)].description = e.target.value;
    });
  });
  root.querySelectorAll('.edit-line-hours').forEach(input => {
    input.addEventListener('input', e => {
      payload.lineItems[Number(input.dataset.idx)].hours = Number(e.target.value);
      recalculateQuotePayload(payload);
      renderEditQuote();
    });
  });
  root.querySelectorAll('.edit-line-rate').forEach(input => {
    input.addEventListener('input', e => {
      payload.lineItems[Number(input.dataset.idx)].rate = Number(e.target.value);
      recalculateQuotePayload(payload);
      renderEditQuote();
    });
  });
  root.querySelectorAll('.edit-line-fixed-cost').forEach(input => {
    input.addEventListener('input', e => {
      payload.lineItems[Number(input.dataset.idx)].cost = roundMoney(e.target.value);
      recalculateQuotePayload(payload);
      renderEditQuote();
    });
  });
  root.querySelectorAll('.edit-line-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      payload.lineItems.splice(Number(btn.dataset.idx), 1);
      recalculateQuotePayload(payload);
      renderEditQuote();
    });
  });
  root.querySelector('#add-line-item').addEventListener('click', () => {
    const phase = root.querySelector('#add-line-phase').value.trim();
    const desc = root.querySelector('#add-line-desc').value.trim();
    const hours = Number(root.querySelector('#add-line-hours').value);
    const rate = Number(root.querySelector('#add-line-rate').value);
    if (phase && desc && (hours > 0 || rate > 0)) {
      payload.lineItems.push({ phase, description: desc, hours, rate, cost: roundMoney(hours * rate) });
      recalculateQuotePayload(payload);
      renderEditQuote();
    }
  });

  // Save actions
  root.querySelector('#edit-save-history').addEventListener('click', async () => {
    try {
      await api.saveQuoteHistory({
        id: state.quoteNumber,
        date: todayIso(),
        client: form,
        project: form.projectName,
        quoteData: {
          projectForm: form,
          quotePayload: payload,
          quoteHtml: buildQuoteHtml({
            quoteNumber: state.quoteNumber,
            quoteDate: todayIso(),
            client: form,
            projectForm: form,
            quotePayload: payload,
            settings: settings,
            logoPath: state.logoPath
          }),
          logoPath: state.logoPath
        },
        status: 'Draft'
      });
      root.querySelector('#edit-quote-info').textContent = 'Quote changes saved.';
      await refreshState();
    } catch (e) {
      root.querySelector('#edit-quote-info').textContent = 'Failed to save changes.';
    }
  });
  root.querySelector('#edit-save-revision').addEventListener('click', async () => {
    // Find next revision
    const base = state.quoteNumber.replace(/-([a-z])$/i, '');
    const siblings = (state.data.quotes || []).filter(q => q.id.startsWith(base));
    const revs = siblings.map(q => {
      const m = q.id.match(/-([a-z])$/i);
      return m ? m[1].toLowerCase().charCodeAt(0) : 96;
    });
    const nextChar = String.fromCharCode(Math.max(...revs, 96) + 1);
    const nextId = `${base}-${nextChar}`;
    try {
      await api.saveQuoteHistory({
        id: nextId,
        date: todayIso(),
        client: form,
        project: form.projectName,
        quoteData: {
          projectForm: form,
          quotePayload: payload,
          quoteHtml: buildQuoteHtml({
            quoteNumber: nextId,
            quoteDate: todayIso(),
            client: form,
            projectForm: form,
            quotePayload: payload,
            settings: settings,
            logoPath: state.logoPath
          }),
          logoPath: state.logoPath
        },
        status: 'Draft'
      });
      root.querySelector('#edit-quote-info').textContent = 'Revision saved as ' + escapeHtml(nextId);
      await refreshState();
    } catch (e) {
      root.querySelector('#edit-quote-info').textContent = 'Failed to save revision.';
    }
  });
  root.querySelector('#edit-save-new').addEventListener('click', async () => {
    try {
      const newId = await api.generateQuoteNumber();
      await api.saveQuoteHistory({
        id: newId,
        date: todayIso(),
        client: form,
        project: form.projectName,
        quoteData: {
          projectForm: form,
          quotePayload: payload,
          quoteHtml: buildQuoteHtml({
            quoteNumber: newId,
            quoteDate: todayIso(),
            client: form,
            projectForm: form,
            quotePayload: payload,
            settings: settings,
            logoPath: state.logoPath
          }),
          logoPath: state.logoPath
        },
        status: 'Draft'
      });
      root.querySelector('#edit-quote-info').textContent = 'Saved as new quote ' + escapeHtml(newId);
      await refreshState();
    } catch (e) {
      root.querySelector('#edit-quote-info').textContent = 'Failed to save as new quote.';
    }
  });
  root.querySelector('#edit-cancel').addEventListener('click', () => {
    state.selectedSection = 'history';
    renderSections();
  });
}
}

function renderTerms() {
  const root = document.getElementById('terms-root');
  root.innerHTML = `
    <div class="card">
      <label for="terms-textarea" style="font-weight:600">Terms & Conditions Text</label>
      <textarea id="terms-textarea" rows="12" style="margin-top:8px">${escapeHtml(state.terms || state.data?.settings?.terms || defaultTerms())}</textarea>
      <div class="actions" style="margin-top:10px">
        <button id="save-terms" class="primary">Save Terms</button>
      </div>
      <div id="terms-info" style="margin-top:8px;color:var(--muted)"></div>
    </div>
  `;
  const textarea = root.querySelector('#terms-textarea');
  const info = root.querySelector('#terms-info');
  root.querySelector('#save-terms').addEventListener('click', async () => {
    const value = textarea.value.trim();
    try {
      const updated = await api.saveSettings({ terms: value });
      state.terms = value;
      state.data.settings = updated;
      info.textContent = 'Terms & Conditions saved.';
    } catch (e) {
      info.textContent = 'Failed to save Terms & Conditions.';
    }
  });
}

function defaultTerms() {
  return `Payment schedule: Bi-weekly invoicing based on progress.\nScope change rate: $125 per hour.\nQuote validity: This quote expires in 30 days.\nRetainer requirement: 50% retainer due at project start.`;
}

function renderStep1() {
  const root = document.getElementById('step1');
  const clients = state.data.clients || [];
  const settings = state.data.settings || {};
  const form = state.projectForm || {
    clientId: '',
    clientName: '',
    clientTitle: '',
    company: '',
    phone: '',
    email: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    projectName: '',
    projectDescription: '',
    services: [],
    hourlyRate: settings.defaultRate || 125,
    validityDays: settings.defaultValidity || 30
  };

  root.innerHTML = `
    <div class="grid-2">
      <label>Client
        <select id="client-id">
          <option value="">Enter New Client</option>
          ${clients.map((c) => `<option value="${c.id}" ${form.clientId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}${c.company ? ` - ${escapeHtml(c.company)}` : ''}</option>`).join('')}
        </select>
      </label>
      <label>Client Title
        <input id="client-title" value="${escapeHtml(form.clientTitle)}" />
      </label>
      <label>Client Name *
        <input id="client-name" value="${escapeHtml(form.clientName)}" />
      </label>
      <label>Company
        <input id="company" value="${escapeHtml(form.company)}" />
      </label>
      <label>Phone
        <input id="phone" value="${escapeHtml(form.phone)}" />
      </label>
      <label>Email
        <input id="email" type="email" value="${escapeHtml(form.email)}" />
      </label>
      <label>Street Address
        <input id="address1" value="${escapeHtml(form.address1)}" />
      </label>
      <label>Suite / Unit
        <input id="address2" value="${escapeHtml(form.address2)}" />
      </label>
      <label>City
        <input id="city" value="${escapeHtml(form.city)}" />
      </label>
      <label>State
        <select id="state">${stateOptionsMarkup(form.state)}</select>
      </label>
      <label>Zip Code
        <input id="zip" value="${escapeHtml(form.zip)}" />
      </label>
    </div>

    <div id="email-warning" class="bubble error hidden"></div>

    <div class="grid-2" style="margin-top:10px">
      <label>Project Name / Re: *
        <input id="project-name" value="${escapeHtml(form.projectName)}" />
      </label>
      <label>Hourly Rate
        <input id="hourly-rate" type="number" min="1" value="${Number(form.hourlyRate || 125)}" />
      </label>
      <label>Quote Validity (days)
        <input id="validity-days" type="number" min="1" value="${Number(form.validityDays || 30)}" />
      </label>
      <div></div>
    </div>

    <label style="margin-top:10px">Project Description
      <textarea id="project-description">${escapeHtml(form.projectDescription)}</textarea>
    </label>

    <div style="margin-top:10px">
      <div style="color:var(--muted);font-size:13px">Services</div>
      <div class="grid-2" id="services-checks">
        ${SERVICES.map((s) => `
          <label class="service-option"><input type="checkbox" value="${escapeHtml(s)}" ${form.services.includes(s) ? 'checked' : ''} /><span>${escapeHtml(s)}</span></label>
        `).join('')}
      </div>
    </div>

    <div id="step1-error" class="bubble error hidden"></div>

    <div class="actions">
      <button id="step1-next" class="primary">Continue to AI Scope Chat</button>
    </div>
  `;

  root.querySelector('#client-id').addEventListener('change', (e) => {
    const id = e.target.value;
    const selected = normalizeClientContact(clients.find((c) => c.id === id) || {});
    state.projectForm = {
      ...form,
      clientId: id,
      clientName: selected ? selected.name : form.clientName,
      clientTitle: selected ? selected.title : form.clientTitle,
      company: selected ? selected.company : form.company,
      phone: selected ? selected.phone : form.phone,
      email: selected ? selected.email : form.email,
      address1: selected ? selected.address1 : form.address1,
      address2: selected ? selected.address2 : form.address2,
      city: selected ? selected.city : form.city,
      state: selected ? selected.state : form.state,
      zip: selected ? selected.zip : form.zip
    };
    renderStep1();
  });

  root.querySelector('#step1-next').addEventListener('click', async () => {
    const services = [...root.querySelectorAll('#services-checks input[type="checkbox"]:checked')].map((el) => el.value);

    state.projectForm = {
      clientId: root.querySelector('#client-id').value,
      clientName: root.querySelector('#client-name').value.trim(),
      clientTitle: root.querySelector('#client-title').value.trim(),
      company: root.querySelector('#company').value.trim(),
      phone: root.querySelector('#phone').value.trim(),
      email: root.querySelector('#email').value.trim(),
      address1: root.querySelector('#address1').value.trim(),
      address2: root.querySelector('#address2').value.trim(),
      city: root.querySelector('#city').value.trim(),
      state: root.querySelector('#state').value.trim(),
      zip: root.querySelector('#zip').value.trim(),
      projectName: root.querySelector('#project-name').value.trim(),
      projectDescription: root.querySelector('#project-description').value.trim(),
      services,
      hourlyRate: Number(root.querySelector('#hourly-rate').value || settings.defaultRate || 125),
      validityDays: Number(root.querySelector('#validity-days').value || settings.defaultValidity || 30)
    };

    const err = root.querySelector('#step1-error');
    const emailWarning = root.querySelector('#email-warning');
    if (!state.projectForm.clientName || !state.projectForm.projectName) {
      err.textContent = 'Client name and project name are required to continue.';
      err.classList.remove('hidden');
      return;
    }
    if (!isValidEmail(state.projectForm.email)) {
      emailWarning.textContent = 'Please enter a valid email address (example: name@company.com).';
      emailWarning.classList.remove('hidden');
      return;
    }
    emailWarning.classList.add('hidden');
    err.classList.add('hidden');

    if (!state.quoteNumber) {
      state.quoteNumber = await api.generateQuoteNumber();
    }

    document.getElementById('step2-btn').disabled = false;
    switchStep(2);
    renderStep2();
  });

  const phoneInput = root.querySelector('#phone');
  phoneInput.addEventListener('input', () => {
    phoneInput.value = formatPhoneNumber(phoneInput.value);
  });

  const emailInput = root.querySelector('#email');
  const emailWarning = root.querySelector('#email-warning');
  emailInput.addEventListener('blur', () => {
    if (!isValidEmail(emailInput.value)) {
      emailWarning.textContent = 'Please enter a valid email address (example: name@company.com).';
      emailWarning.classList.remove('hidden');
      return;
    }
    emailWarning.classList.add('hidden');
  });
}

function switchStep(stepNumber) {
  document.querySelectorAll('.step-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx + 1 === stepNumber);
  });
  document.querySelectorAll('.step-panel').forEach((panel, idx) => {
    panel.classList.toggle('active', idx + 1 === stepNumber);
  });
}

function renderStep2() {
  const root = document.getElementById('step2');

  root.innerHTML = `
    <div class="chat-log" id="chat-log"></div>
    <label style="margin-top:10px">Your message
      <textarea id="chat-input" placeholder="Add details, constraints, timeline, and known assumptions..."></textarea>
    </label>
    <div class="actions">
      <button id="chat-send" class="primary">Send</button>
      <button id="chat-generate" class="secondary">Generate Quote -></button>
    </div>
  `;

  const log = root.querySelector('#chat-log');

  if (state.chatMessages.length === 0) {
    state.chatMessages.push({ role: 'assistant', type: 'assistant', text: 'Please share any additional scope details and constraints. I will ask clarifying questions and build your quote.' });
  }

  for (const m of state.chatMessages) {
    const div = document.createElement('div');
    div.className = `bubble ${m.type === 'error' ? 'error' : m.role}`;
    div.textContent = m.text;
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;

  const sendTurn = async (forceJson) => {
    const input = root.querySelector('#chat-input');
    const text = input.value.trim();

    if (text) {
      state.chatMessages.push({ role: 'user', type: 'user', text });
      input.value = '';
    }

    renderStep2();

    try {
      const response = await api.chatTurn({
        messages: state.chatMessages.map((m) => ({ role: m.role, text: m.text })),
        projectInfo: state.projectForm,
        forceJson
      });

      if (response.ready === true && response.quotePayload) {
        state.readyQuotePayload = response.quotePayload;
        document.getElementById('step3-btn').disabled = false;
        switchStep(3);
        renderStep3();
        return;
      }

      state.chatMessages.push({ role: 'assistant', type: 'assistant', text: response.assistantText || 'Please provide additional details so I can finalize scope.' });
      renderStep2();
    } catch (error) {
      state.chatMessages.push({ role: 'assistant', type: 'error', text: `API Error: ${error.message || 'Failed to generate response.'}` });
      renderStep2();
    }
  };

  root.querySelector('#chat-send').addEventListener('click', () => sendTurn(false));
  root.querySelector('#chat-generate').addEventListener('click', () => sendTurn(true));
}

function buildQuoteHtml({ quoteNumber, quoteDate, client, projectForm, quotePayload, settings, logoPath }) {
  const lineRows = (quotePayload.lineItems || []).map((item) => {
    const hours = item.isFixed ? '' : Number(item.hours || 0).toFixed(1);
    const rate = item.isFixed ? '' : money(item.rate || 0);
    return `
      <tr>
        <td>${escapeHtml(item.phase || '')}</td>
        <td>${escapeHtml(item.description || '')}</td>
        <td class="right">${escapeHtml(hours)}</td>
        <td class="right">${escapeHtml(rate)}</td>
        <td class="right">${money(item.cost || 0)}</td>
      </tr>
    `;
  }).join('');

  const validityDate = addDays(quoteDate, projectForm.validityDays || settings.defaultValidity || 30);
  const tcPayment = quotePayload.paymentTerms || 'Bi-weekly invoicing based on progress.';
  const addressLines = clientAddressLines(client)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('');
  const termsText = (settings && settings.terms) ? settings.terms : defaultTerms();

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Quote ${escapeHtml(quoteNumber)}</title>
      <style>${QUOTE_STYLE}</style>
    </head>
    <body>
      <article class="quote-doc">
        <div class="quote-header">
          <img class="quote-logo" src="file:///${logoPath.replace(/\\/g, '/')}" alt="Draftek logo" />
          <div class="quote-id">QUOTE: ${escapeHtml(quoteNumber)}</div>
        </div>
        <hr class="quote-rule" />
        <div class="quote-body">
          <div><strong>Date:</strong> ${escapeHtml(quoteDate)}</div>
          <div style="margin-top:8px">
            <div><strong>${escapeHtml(client.name || '')}</strong></div>
            <div>${escapeHtml(client.title || '')}</div>
            <div>${escapeHtml(client.company || '')}</div>
            ${addressLines}
            <div>${escapeHtml(client.phone || '')}</div>
            <div>${escapeHtml(client.email || '')}</div>
          </div>

          <div style="margin-top:10px"><strong>Re:</strong> ${escapeHtml(projectForm.projectName || '')}</div>

          <p style="margin-top:14px">${escapeHtml(quotePayload.greeting || `Hi ${client.name || ''},`)}</p>
          <p>${escapeHtml(quotePayload.scopeNarrative || '')}</p>

          <table class="table" style="margin-top:10px">
            <thead>
              <tr>
                <th>Phase/Task</th>
                <th>Description</th>
                <th class="right">Est. Hrs</th>
                <th class="right">Rate</th>
                <th class="right">Cost</th>
              </tr>
            </thead>
            <tbody>
              ${lineRows}
              <tr>
                <td colspan="4" style="background:#042c53;color:#fff"><strong>Not-to-Exceed Total</strong></td>
                <td class="right" style="background:#042c53;color:#fff"><strong>${money(quotePayload.nteTotal || 0)}</strong></td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top:12px"><strong>Deliverables</strong></div>
          <ul>
            ${(quotePayload.deliverables || []).map((d) => `<li>${escapeHtml(d)}</li>`).join('')}
          </ul>

          <p><strong>Estimated timeline:</strong> ${escapeHtml(quotePayload.timeline || '')}</p>

          <p style="margin-top:14px">I am looking forward to working with you on this project.</p>

          <div style="margin-top:20px">
            <div style="font-style:italic">${escapeHtml(settings.ownerName || '')}</div>
            <div>${escapeHtml(settings.businessName || '')}</div>
            <div>${escapeHtml(settings.phone || '')}</div>
          </div>

          <div class="quote-tc" style="margin-top:20px">
            <strong>Terms & Conditions</strong>
            <div style="white-space:pre-line">${escapeHtml(termsText)}</div>
          </div>
        </div>
        <div class="quote-footer">
          ${escapeHtml(settings.address1 || '')}${settings.address2 ? `, ${escapeHtml(settings.address2)}` : ''}, ${escapeHtml(settings.cityStateZip || '')}
        </div>
      </article>
    </body>
  </html>
  `;
}

function renderStep3() {
  const root = document.getElementById('step3');

  if (!state.readyQuotePayload) {
    root.innerHTML = '<p>Generate a ready quote in Step 2 first.</p>';
    return;
  }

  const quoteDate = todayIso();
  recalculateQuotePayload(state.readyQuotePayload);
  const client = {
    name: state.projectForm.clientName,
    title: state.projectForm.clientTitle,
    company: state.projectForm.company,
    phone: state.projectForm.phone,
    email: state.projectForm.email,
    address1: state.projectForm.address1,
    address2: state.projectForm.address2,
    city: state.projectForm.city,
    state: state.projectForm.state,
    zip: state.projectForm.zip,
    address: clientAddressLines(state.projectForm).join(', ')
  };

  state.quotePreviewClient = client;

  const html = buildQuoteHtml({
    quoteNumber: state.quoteNumber,
    quoteDate,
    client,
    projectForm: state.projectForm,
    quotePayload: state.readyQuotePayload,
    settings: state.data.settings,
    logoPath: state.logoPath
  });

  root.innerHTML = `
    <div class="card" style="margin-bottom:10px">
      <div style="font-weight:600;margin-bottom:8px">Edit Quote Line Items</div>
      <table class="table">
        <thead>
          <tr>
            <th>Phase/Task</th>
            <th>Description</th>
            <th class="right">Est. Hrs</th>
            <th class="right">Rate</th>
            <th class="right">Cost</th>
          </tr>
        </thead>
        <tbody>
          ${(state.readyQuotePayload.lineItems || []).map((item, index) => `
            <tr>
              <td>${escapeHtml(item.phase || '')}</td>
              <td>${escapeHtml(item.description || '')}</td>
              <td class="right">${item.isFixed ? '<span class="badge">Fixed</span>' : `<input class="line-hours" data-index="${index}" type="number" step="0.5" min="0" value="${Number(item.hours || 0)}" style="max-width:90px" />`}</td>
              <td class="right">${item.isFixed ? '<span class="badge">Fixed</span>' : `<input class="line-rate" data-index="${index}" type="number" step="1" min="0" value="${Number(item.rate || 0)}" style="max-width:90px" />`}</td>
              <td class="right">${item.isFixed ? `<input class="line-fixed-cost" data-index="${index}" type="number" step="0.01" min="0" value="${Number(item.cost || 0)}" style="max-width:110px" />` : money(item.cost || 0)}</td>
            </tr>
          `).join('')}
          <tr>
            <td colspan="4" style="background:#042c53;color:#fff"><strong>Not-to-Exceed Total</strong></td>
            <td class="right" style="background:#042c53;color:#fff"><strong>${money(state.readyQuotePayload.nteTotal || 0)}</strong></td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:6px;color:var(--muted)">Hours and rates update cost automatically for non-fixed items.</div>
    </div>

    <div class="actions" style="margin-bottom:8px">
      <button id="save-pdf" class="primary">Save PDF</button>
      <button id="save-docx" class="primary">Save to Word</button>
      <button id="save-history" class="secondary">Save to History</button>
    </div>
    <iframe id="quote-frame" style="width:100%;height:730px;border:1px solid #d9dee5;border-radius:10px;background:#fff"></iframe>
    <div id="step3-info" style="margin-top:10px;color:var(--muted)"></div>
  `;
  root.querySelector('#save-docx').addEventListener('click', async () => {
    try {
      const info = root.querySelector('#step3-info');
      const result = await api.saveDocx({
        quoteNumber: state.quoteNumber,
        quoteDate,
        logoPath: state.logoPath,
        quotePayload: state.readyQuotePayload,
        projectForm: state.projectForm,
        settings: state.data.settings
      });
      info.textContent = result.canceled
        ? (result.error ? `Word export error: ${result.error}` : 'Word save canceled.')
        : `Word document saved to ${result.filePath}`;
    } catch (error) {
      root.querySelector('#step3-info').textContent = `Word export error: ${error.message || 'Unable to save Word document.'}`;
    }
  });

  const frame = root.querySelector('#quote-frame');
  frame.srcdoc = html;

  root.querySelectorAll('.line-hours').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.index);
      const line = state.readyQuotePayload.lineItems[idx];
      line.hours = Number(input.value || 0);
      recalculateQuotePayload(state.readyQuotePayload);
      renderStep3();
    });
  });

  root.querySelectorAll('.line-rate').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.index);
      const line = state.readyQuotePayload.lineItems[idx];
      line.rate = Number(input.value || 0);
      recalculateQuotePayload(state.readyQuotePayload);
      renderStep3();
    });
  });

  root.querySelectorAll('.line-fixed-cost').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.index);
      const line = state.readyQuotePayload.lineItems[idx];
      line.cost = roundMoney(input.value || 0);
      recalculateQuotePayload(state.readyQuotePayload);
      renderStep3();
    });
  });

  root.querySelector('#save-pdf').addEventListener('click', async () => {
    try {
      const result = await api.savePdf({ html, quoteNumber: state.quoteNumber, logoPath: state.logoPath });
      const info = root.querySelector('#step3-info');
      info.textContent = result.canceled ? 'PDF save canceled.' : `PDF saved to ${result.filePath}`;
    } catch (error) {
      root.querySelector('#step3-info').textContent = `PDF error: ${error.message || 'Unable to save PDF.'}`;
    }
  });

  root.querySelector('#save-history').addEventListener('click', async () => {
    try {
      await api.saveQuoteHistory({
        id: state.quoteNumber,
        date: quoteDate,
        client,
        project: state.projectForm.projectName,
        quoteData: {
          projectForm: state.projectForm,
          quotePayload: state.readyQuotePayload,
          quoteHtml: html,
          logoPath: state.logoPath
        },
        status: 'Draft'
      });
      const info = root.querySelector('#step3-info');
      info.textContent = 'Quote saved to history.';
      await refreshState();
    } catch (error) {
      root.querySelector('#step3-info').textContent = `Save error: ${error.message || 'Unable to save quote.'}`;
    }
  });
}

function renderHistory() {
  const root = document.getElementById('history-root');
  const rows = [...(state.data.quotes || [])].sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));

  const selected = rows.find((q) => q.id === state.selectedHistoryQuoteId) || null;

  root.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Quote #</th>
          <th>Client</th>
          <th>Project</th>
          <th>Date</th>
          <th class="right">NTE Total</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((q) => {
          const nte = q.quoteData?.quotePayload?.nteTotal || 0;
          return `
            <tr data-id="${q.id}">
              <td><button class="secondary open-quote" data-id="${q.id}">${escapeHtml(q.id)}</button></td>
              <td>${escapeHtml(q.client?.name || '')}</td>
              <td>${escapeHtml(q.project || '')}</td>
              <td>${escapeHtml(q.date || '')}</td>
              <td class="right">${money(nte)}</td>
              <td>
                <select class="status-select" data-id="${q.id}">
                  ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${q.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                </select>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div id="history-preview" style="margin-top:12px"></div>
  `;

  root.querySelectorAll('.open-quote').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedHistoryQuoteId = btn.dataset.id;
      renderHistory();
    });
  });

  root.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await api.updateQuoteStatus({ id: sel.dataset.id, status: sel.value });
      await refreshState();
    });
  });

  const previewRoot = root.querySelector('#history-preview');
  if (!selected) {
    previewRoot.innerHTML = '<div class="card">Select a quote number to view read-only preview.</div>';
    return;
  }

  previewRoot.innerHTML = `
    <div class="actions" style="margin-bottom:8px;display:flex;gap:8px;align-items:center">
      <button id="history-save-pdf" class="primary">Save PDF</button>
      <button id="history-save-docx" class="primary">Save to Word</button>
      <button id="history-edit-quote" class="secondary">Edit Quote</button>
      <button id="history-save-as-new" class="secondary">Save as New</button>
      <span class="badge">Read-only preview</span>
    </div>
    <iframe id="history-frame" style="width:100%;height:650px;border:1px solid #d9dee5;border-radius:10px;background:#fff"></iframe>
    <div id="history-info" style="margin-top:8px;color:var(--muted)"></div>
    <div id="revision-controls" style="margin-top:10px"></div>
  `;
  previewRoot.querySelector('#history-save-docx').addEventListener('click', async () => {
    try {
      const info = previewRoot.querySelector('#history-info');
      const result = await api.saveDocx({
        quoteNumber: selected.id,
        quoteDate: selected.date || '',
        logoPath: selected.quoteData?.logoPath || state.logoPath,
        quotePayload: selected.quoteData?.quotePayload,
        projectForm: selected.quoteData?.projectForm,
        settings: state.data.settings
      });
      info.textContent = result.canceled
        ? (result.error ? `Word export error: ${result.error}` : 'Word save canceled.')
        : `Word document saved to ${result.filePath}`;
    } catch (error) {
      previewRoot.querySelector('#history-info').textContent = `Word export error: ${error.message || 'Unable to save Word document.'}`;
    }
  });

  const frame = previewRoot.querySelector('#history-frame');
  frame.srcdoc = selected.quoteData?.quoteHtml || '<p>No preview available.</p>';

  previewRoot.querySelector('#history-save-pdf').addEventListener('click', async () => {
    try {
      const result = await api.savePdf({
        html: selected.quoteData?.quoteHtml || '<p>No preview available.</p>',
        quoteNumber: selected.id,
        logoPath: selected.quoteData?.logoPath || state.logoPath
      });
      previewRoot.querySelector('#history-info').textContent = result.canceled ? 'PDF save canceled.' : `PDF saved to ${result.filePath}`;
    } catch (error) {
      previewRoot.querySelector('#history-info').textContent = `PDF error: ${error.message || 'Unable to save PDF.'}`;
    }
  });

  // Edit Quote: load into builder for editing
  previewRoot.querySelector('#history-edit-quote').addEventListener('click', () => {
    // Load quote data into editor state
    const q = selected;
    state.projectForm = { ...q.quoteData.projectForm };
    state.readyQuotePayload = JSON.parse(JSON.stringify(q.quoteData.quotePayload));
    state.quoteNumber = q.id;
    state.selectedSection = 'editQuote';
    renderSections();
  });

  // Save as New: load into builder, clear quote number
  previewRoot.querySelector('#history-save-as-new').addEventListener('click', () => {
    const q = selected;
    state.projectForm = { ...q.quoteData.projectForm };
    state.readyQuotePayload = JSON.parse(JSON.stringify(q.quoteData.quotePayload));
    state.quoteNumber = '';
    state.selectedSection = 'newQuote';
    renderSections();
  });

  // Revision controls (shown after Edit)
  function showRevisionControls(baseId) {
    const root = document.getElementById('revision-controls');
    if (!root) return;
    // Find next revision letter
    const base = baseId.replace(/-([a-z])$/i, '');
    const siblings = (state.data.quotes || []).filter(q => q.id.startsWith(base));
    const revs = siblings.map(q => {
      const m = q.id.match(/-([a-z])$/i);
      return m ? m[1].toLowerCase().charCodeAt(0) : 96;
    });
    const nextChar = String.fromCharCode(Math.max(...revs, 96) + 1);
    const nextId = `${base}-${nextChar}`;
    root.innerHTML = `
      <div class="card" style="margin-top:8px">
        <div style="font-weight:600">Revision Controls</div>
        <div style="margin:8px 0">Current Quote #: <b>${escapeHtml(baseId)}</b></div>
        <button id="save-revision" class="primary">Save as Revision (${escapeHtml(nextId)})</button>
      </div>
    `;
    root.querySelector('#save-revision').addEventListener('click', async () => {
      try {
        // Save as revision
        await api.saveQuoteHistory({
          id: nextId,
          date: todayIso(),
          client: state.projectForm,
          project: state.projectForm.projectName,
          quoteData: {
            projectForm: state.projectForm,
            quotePayload: state.readyQuotePayload,
            quoteHtml: buildQuoteHtml({
              quoteNumber: nextId,
              quoteDate: todayIso(),
              client: state.projectForm,
              projectForm: state.projectForm,
              quotePayload: state.readyQuotePayload,
              settings: state.data.settings,
              logoPath: state.logoPath
            }),
            logoPath: state.logoPath
          },
          status: 'Draft'
        });
        root.innerHTML = '<span style="color:green">Revision saved as ' + escapeHtml(nextId) + '.</span>';
        await refreshState();
      } catch (e) {
        root.innerHTML = '<span style="color:red">Failed to save revision.</span>';
      }
    });
  }
}

function clientFormValue(root) {
  return {
    id: root.querySelector('#client-form-id').value || undefined,
    name: root.querySelector('#client-form-name').value.trim(),
    title: root.querySelector('#client-form-title').value.trim(),
    company: root.querySelector('#client-form-company').value.trim(),
    phone: root.querySelector('#client-form-phone').value.trim(),
    email: root.querySelector('#client-form-email').value.trim(),
    address1: root.querySelector('#client-form-address1').value.trim(),
    address2: root.querySelector('#client-form-address2').value.trim(),
    city: root.querySelector('#client-form-city').value.trim(),
    state: root.querySelector('#client-form-state').value.trim(),
    zip: root.querySelector('#client-form-zip').value.trim()
  };
}

function renderClients() {
  const root = document.getElementById('clients-root');
  const editing = normalizeClientContact((state.data.clients || []).find((c) => c.id === state.editingClientId) || {
    id: '',
    name: '',
    title: '',
    company: '',
    phone: '',
    email: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: ''
  });

  root.innerHTML = `
    <div class="grid-2">
      <div>
        <table class="table">
          <thead>
            <tr><th>Name</th><th>Company</th><th>Phone</th><th>Email</th><th>Address</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${(state.data.clients || []).map((c) => `
              ${(() => {
                const client = normalizeClientContact(c);
                const addr = clientAddressLines(client).join(', ');
                return `
              <tr>
                <td>${escapeHtml(client.name || '')}</td>
                <td>${escapeHtml(client.company || '')}</td>
                <td>${escapeHtml(client.phone || '')}</td>
                <td>${escapeHtml(client.email || '')}</td>
                <td>${escapeHtml(addr)}</td>
                <td>
                  <button class="secondary client-edit" data-id="${client.id}">Edit</button>
                  <button class="danger client-delete" data-id="${client.id}">Delete</button>
                </td>
              </tr>
              `;
              })()}
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="card">
        <input id="client-form-id" type="hidden" value="${escapeHtml(editing.id)}" />
        <label>Name
          <input id="client-form-name" value="${escapeHtml(editing.name)}" />
        </label>
        <label>Title
          <input id="client-form-title" value="${escapeHtml(editing.title)}" />
        </label>
        <label>Company
          <input id="client-form-company" value="${escapeHtml(editing.company)}" />
        </label>
        <label>Phone
          <input id="client-form-phone" value="${escapeHtml(editing.phone)}" />
        </label>
        <label>Email
          <input id="client-form-email" type="email" value="${escapeHtml(editing.email)}" />
        </label>
        <label>Street Address
          <input id="client-form-address1" value="${escapeHtml(editing.address1)}" />
        </label>
        <label>Suite / Unit
          <input id="client-form-address2" value="${escapeHtml(editing.address2)}" />
        </label>
        <label>City
          <input id="client-form-city" value="${escapeHtml(editing.city)}" />
        </label>
        <label>State
          <select id="client-form-state">${stateOptionsMarkup(editing.state)}</select>
        </label>
        <label>Zip Code
          <input id="client-form-zip" value="${escapeHtml(editing.zip)}" />
        </label>
        <div id="client-email-warning" class="bubble error hidden"></div>
        <div id="client-form-info" style="margin-top:8px;color:var(--muted)"></div>
        <div class="actions">
          <button id="client-save" class="primary">Save Client</button>
          <button id="client-reset" class="secondary">New</button>
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll('.client-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingClientId = btn.dataset.id;
      renderClients();
    });
  });

  root.querySelectorAll('.client-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.deleteClient(btn.dataset.id);
      if (state.editingClientId === btn.dataset.id) state.editingClientId = null;
      await refreshState();
      renderClients();
    });
  });

  root.querySelector('#client-save').addEventListener('click', async () => {
    const value = clientFormValue(root);
    const warning = root.querySelector('#client-email-warning');
    const info = root.querySelector('#client-form-info');
    info.textContent = '';
    if (!value.name) return;
    if (!isValidEmail(value.email)) {
      warning.textContent = 'Please enter a valid email address (example: name@company.com).';
      warning.classList.remove('hidden');
      return;
    }
    warning.classList.add('hidden');

    if (isDuplicateClientEntry(state.data.clients, value, value.id || '')) {
      info.style.color = 'var(--error)';
      info.textContent = 'Duplicate client detected. An entry with the same name/company or email already exists.';
      return;
    }

    try {
      if (value.id) {
        await api.updateClient(value);
      } else {
        await api.addClient(value);
      }
      state.editingClientId = null;
      await refreshState();
      renderClients();
    } catch (error) {
      info.style.color = 'var(--error)';
      info.textContent = `Save failed: ${error.message || 'Unable to save client.'}`;
    }
  });

  root.querySelector('#client-reset').addEventListener('click', () => {
    state.editingClientId = null;
    renderClients();
  });

  const phoneInput = root.querySelector('#client-form-phone');
  phoneInput.addEventListener('input', () => {
    phoneInput.value = formatPhoneNumber(phoneInput.value);
  });

  const emailInput = root.querySelector('#client-form-email');
  const warning = root.querySelector('#client-email-warning');
  emailInput.addEventListener('blur', () => {
    if (!isValidEmail(emailInput.value)) {
      warning.textContent = 'Please enter a valid email address (example: name@company.com).';
      warning.classList.remove('hidden');
      return;
    }
    warning.classList.add('hidden');
  });
}

function renderSettings() {
  const root = document.getElementById('settings-root');
  const s = state.data.settings || {};
  // Load or initialize rate schedule
  if (!state.rateSchedule || !Array.isArray(state.rateSchedule) || state.rateSchedule.length === 0) {
    state.rateSchedule = (s.rateSchedule && Array.isArray(s.rateSchedule) && s.rateSchedule.length > 0)
      ? s.rateSchedule.slice()
      : DEFAULT_RATE_SCHEDULE.slice();
  }

  root.innerHTML = `
    <div class="grid-2">
      <label>Business Name
        <input data-key="businessName" value="${escapeHtml(s.businessName || '')}" />
      </label>
      <label>Tagline
        <input data-key="tagline" value="${escapeHtml(s.tagline || '')}" />
      </label>
      <label>Owner / Signatory
        <input data-key="ownerName" value="${escapeHtml(s.ownerName || '')}" />
      </label>
      <label>Title
        <input data-key="ownerTitle" value="${escapeHtml(s.ownerTitle || '')}" />
      </label>
      <label>Phone
        <input data-key="phone" value="${escapeHtml(s.phone || '')}" />
      </label>
      <label>Address Line 1
        <input data-key="address1" value="${escapeHtml(s.address1 || '')}" />
      </label>
      <label>Address Line 2
        <input data-key="address2" value="${escapeHtml(s.address2 || '')}" />
      </label>
      <label>City, State, Zip
        <input data-key="cityStateZip" value="${escapeHtml(s.cityStateZip || '')}" />
      </label>
      <label>Default Hourly Rate
        <input data-key="defaultRate" type="number" value="${Number(s.defaultRate || 125)}" />
      </label>
      <label>Default Quote Validity (days)
        <input data-key="defaultValidity" type="number" value="${Number(s.defaultValidity || 30)}" />
      </label>
    </div>

    <div class="card" style="margin-top:18px">
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">Service Rate Schedule</div>
      <table class="table" id="rate-schedule-table">
        <thead>
          <tr><th>Category</th><th>Activity</th><th>Rate ($/hr)</th><th></th></tr>
        </thead>
        <tbody>
          ${state.rateSchedule.map((row, idx) => `
            <tr>
              <td><input class="rate-category" data-idx="${idx}" value="${escapeHtml(row.category)}" /></td>
              <td><input class="rate-activity" data-idx="${idx}" value="${escapeHtml(row.activity)}" /></td>
              <td><input class="rate-rate" data-idx="${idx}" type="number" min="0" value="${Number(row.rate)}" style="max-width:90px" /></td>
              <td><button class="danger rate-remove" data-idx="${idx}" title="Remove">✕</button></td>
            </tr>
          `).join('')}
          <tr>
            <td><input id="add-category" placeholder="Category" /></td>
            <td><input id="add-activity" placeholder="Activity" /></td>
            <td><input id="add-rate" type="number" min="0" placeholder="Rate" style="max-width:90px" /></td>
            <td><button id="add-row" class="secondary">Add</button></td>
          </tr>
        </tbody>
      </table>
      <div class="actions" style="margin-top:8px">
        <button id="save-rate-schedule" class="primary">Save Rate Schedule</button>
      </div>
      <div id="rate-schedule-info" style="margin-top:8px;color:var(--muted)"></div>
    </div>

    <div class="card" style="margin-top:12px">
      <div style="font-size:13px;color:var(--muted)">Current Logo</div>
      <img src="file:///${state.logoPath.replace(/\\/g, '/')}" alt="logo" style="margin-top:8px;max-width:220px;max-height:100px;object-fit:contain;border:1px solid #d9dee5;padding:4px;background:#fff" />
      <div class="actions">
        <button id="change-logo" class="secondary">Change Logo</button>
      </div>
    </div>

    <div id="settings-info" style="margin-top:10px;color:var(--muted)">${state.hasApiKey ? 'API key is loaded from environment.' : 'No API key detected in environment.'}</div>
  `;

  // Settings fields
  root.querySelectorAll('input[data-key]').forEach((input) => {
    input.addEventListener('change', async () => {
      const key = input.dataset.key;
      const numericKeys = new Set(['defaultRate', 'defaultValidity']);
      const value = numericKeys.has(key) ? Number(input.value || 0) : input.value;
      const updated = await api.saveSettings({ [key]: value });
      state.data.settings = updated;
      root.querySelector('#settings-info').textContent = 'Settings saved.';
    });
  });

  // Rate schedule editing
  root.querySelectorAll('.rate-category').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(input.dataset.idx);
      state.rateSchedule[idx].category = input.value;
    });
  });
  root.querySelectorAll('.rate-activity').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(input.dataset.idx);
      state.rateSchedule[idx].activity = input.value;
    });
  });
  root.querySelectorAll('.rate-rate').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(input.dataset.idx);
      state.rateSchedule[idx].rate = Number(input.value);
    });
  });
  root.querySelectorAll('.rate-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(btn.dataset.idx);
      state.rateSchedule.splice(idx, 1);
      renderSettings();
    });
  });
  root.querySelector('#add-row').addEventListener('click', () => {
    const cat = root.querySelector('#add-category').value.trim();
    const act = root.querySelector('#add-activity').value.trim();
    const rate = Number(root.querySelector('#add-rate').value);
    if (cat && act && rate > 0) {
      state.rateSchedule.push({ category: cat, activity: act, rate });
      renderSettings();
    }
  });
  root.querySelector('#save-rate-schedule').addEventListener('click', async () => {
    try {
      const updated = await api.saveSettings({ rateSchedule: state.rateSchedule });
      state.data.settings = updated;
      root.querySelector('#rate-schedule-info').textContent = 'Rate schedule saved.';
    } catch (e) {
      root.querySelector('#rate-schedule-info').textContent = 'Failed to save rate schedule.';
    }
  });

  root.querySelector('#change-logo').addEventListener('click', async () => {
    const result = await api.pickLogo();
    if (!result.canceled) {
      state.logoPath = result.logoPath;
      renderSettings();
    }
  });
}

async function refreshState() {
  const initial = await api.getInitialState();
  state.data = initial.data;
  state.logoPath = initial.logoPath;
  state.hasApiKey = initial.hasApiKey;
}

function wireStepButtons() {
  document.getElementById('step1-btn').addEventListener('click', () => switchStep(1));
  document.getElementById('step2-btn').addEventListener('click', () => {
    if (!document.getElementById('step2-btn').disabled) switchStep(2);
  });
  document.getElementById('step3-btn').addEventListener('click', () => {
    if (!document.getElementById('step3-btn').disabled) switchStep(3);
  });
}

async function init() {
  await refreshState();
  wireNavigation();
  wireStepButtons();
  renderSections();
}

init();
