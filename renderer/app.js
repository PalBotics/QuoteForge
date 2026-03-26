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
  editingClientId: null
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
  } else if (state.selectedSection === 'history') {
    renderHistory();
  } else if (state.selectedSection === 'clients') {
    renderClients();
  } else if (state.selectedSection === 'settings') {
    renderSettings();
  }
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
    address: '',
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
      <label>Address
        <input id="address" value="${escapeHtml(form.address)}" />
      </label>
    </div>

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
          <label><input type="checkbox" value="${escapeHtml(s)}" ${form.services.includes(s) ? 'checked' : ''} /> ${escapeHtml(s)}</label>
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
    const selected = clients.find((c) => c.id === id);
    state.projectForm = {
      ...form,
      clientId: id,
      clientName: selected ? selected.name : form.clientName,
      clientTitle: selected ? selected.title : form.clientTitle,
      company: selected ? selected.company : form.company,
      phone: selected ? selected.phone : form.phone,
      address: selected ? selected.address : form.address
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
      address: root.querySelector('#address').value.trim(),
      projectName: root.querySelector('#project-name').value.trim(),
      projectDescription: root.querySelector('#project-description').value.trim(),
      services,
      hourlyRate: Number(root.querySelector('#hourly-rate').value || settings.defaultRate || 125),
      validityDays: Number(root.querySelector('#validity-days').value || settings.defaultValidity || 30)
    };

    const err = root.querySelector('#step1-error');
    if (!state.projectForm.clientName || !state.projectForm.projectName) {
      err.textContent = 'Client name and project name are required to continue.';
      err.classList.remove('hidden');
      return;
    }
    err.classList.add('hidden');

    if (!state.quoteNumber) {
      state.quoteNumber = await api.generateQuoteNumber();
    }

    document.getElementById('step2-btn').disabled = false;
    switchStep(2);
    renderStep2();
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
            <div>${escapeHtml(client.address || '')}</div>
            <div>${escapeHtml(client.phone || '')}</div>
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

          <div class="quote-tc">
            <strong>Terms & Conditions</strong>
            <div>Payment schedule: ${escapeHtml(tcPayment)}</div>
            <div>Scope change rate: ${money(quotePayload.overflowRate || projectForm.hourlyRate || settings.defaultRate || 125)} per hour.</div>
            <div>Quote validity: This quote expires on ${escapeHtml(validityDate)}.</div>
            <div>Retainer requirement: 50% retainer due at project start.</div>
          </div>

          <p style="margin-top:14px">I am looking forward to working with you on this project.</p>

          <div style="margin-top:20px">
            <div style="font-style:italic">${escapeHtml(settings.ownerName || '')}</div>
            <div>${escapeHtml(settings.businessName || '')}</div>
            <div>${escapeHtml(settings.phone || '')}</div>
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
  const client = {
    name: state.projectForm.clientName,
    title: state.projectForm.clientTitle,
    company: state.projectForm.company,
    phone: state.projectForm.phone,
    address: state.projectForm.address
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
    <div class="actions" style="margin-bottom:8px">
      <button id="save-pdf" class="primary">Save PDF</button>
      <button id="save-history" class="secondary">Save to History</button>
    </div>
    <iframe id="quote-frame" style="width:100%;height:730px;border:1px solid #d9dee5;border-radius:10px;background:#fff"></iframe>
    <div id="step3-info" style="margin-top:10px;color:var(--muted)"></div>
  `;

  const frame = root.querySelector('#quote-frame');
  frame.srcdoc = html;

  root.querySelector('#save-pdf').addEventListener('click', async () => {
    try {
      const result = await api.savePdf({ html, quoteNumber: state.quoteNumber });
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
          quoteHtml: html
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
    <div class="actions" style="margin-bottom:8px">
      <button id="history-save-pdf" class="primary">Save PDF</button>
      <span class="badge">Read-only preview</span>
    </div>
    <iframe id="history-frame" style="width:100%;height:650px;border:1px solid #d9dee5;border-radius:10px;background:#fff"></iframe>
    <div id="history-info" style="margin-top:8px;color:var(--muted)"></div>
  `;

  const frame = previewRoot.querySelector('#history-frame');
  frame.srcdoc = selected.quoteData?.quoteHtml || '<p>No preview available.</p>';

  previewRoot.querySelector('#history-save-pdf').addEventListener('click', async () => {
    try {
      const result = await api.savePdf({
        html: selected.quoteData?.quoteHtml || '<p>No preview available.</p>',
        quoteNumber: selected.id
      });
      previewRoot.querySelector('#history-info').textContent = result.canceled ? 'PDF save canceled.' : `PDF saved to ${result.filePath}`;
    } catch (error) {
      previewRoot.querySelector('#history-info').textContent = `PDF error: ${error.message || 'Unable to save PDF.'}`;
    }
  });
}

function clientFormValue(root) {
  return {
    id: root.querySelector('#client-form-id').value || undefined,
    name: root.querySelector('#client-form-name').value.trim(),
    title: root.querySelector('#client-form-title').value.trim(),
    company: root.querySelector('#client-form-company').value.trim(),
    phone: root.querySelector('#client-form-phone').value.trim(),
    address: root.querySelector('#client-form-address').value.trim()
  };
}

function renderClients() {
  const root = document.getElementById('clients-root');
  const editing = (state.data.clients || []).find((c) => c.id === state.editingClientId) || {
    id: '',
    name: '',
    title: '',
    company: '',
    phone: '',
    address: ''
  };

  root.innerHTML = `
    <div class="grid-2">
      <div>
        <table class="table">
          <thead>
            <tr><th>Name</th><th>Company</th><th>Phone</th><th>Address</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${(state.data.clients || []).map((c) => `
              <tr>
                <td>${escapeHtml(c.name || '')}</td>
                <td>${escapeHtml(c.company || '')}</td>
                <td>${escapeHtml(c.phone || '')}</td>
                <td>${escapeHtml(c.address || '')}</td>
                <td>
                  <button class="secondary client-edit" data-id="${c.id}">Edit</button>
                  <button class="danger client-delete" data-id="${c.id}">Delete</button>
                </td>
              </tr>
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
        <label>Address
          <input id="client-form-address" value="${escapeHtml(editing.address)}" />
        </label>
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
    });
  });

  root.querySelector('#client-save').addEventListener('click', async () => {
    const value = clientFormValue(root);
    if (!value.name) return;

    if (value.id) {
      await api.updateClient(value);
    } else {
      await api.addClient(value);
    }
    state.editingClientId = null;
    await refreshState();
  });

  root.querySelector('#client-reset').addEventListener('click', () => {
    state.editingClientId = null;
    renderClients();
  });
}

function renderSettings() {
  const root = document.getElementById('settings-root');
  const s = state.data.settings || {};

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

    <div class="card" style="margin-top:12px">
      <div style="font-size:13px;color:var(--muted)">Current Logo</div>
      <img src="file:///${state.logoPath.replace(/\\/g, '/')}" alt="logo" style="margin-top:8px;max-width:220px;max-height:100px;object-fit:contain;border:1px solid #d9dee5;padding:4px;background:#fff" />
      <div class="actions">
        <button id="change-logo" class="secondary">Change Logo</button>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <label>Anthropic API Key
        <input id="api-key" type="password" placeholder="sk-ant-..." />
      </label>
      <div class="actions">
        <button id="save-api-key" class="primary">Save API Key</button>
        <span class="badge">${state.hasApiKey ? 'Key loaded' : 'No key loaded'}</span>
      </div>
    </div>

    <div id="settings-info" style="margin-top:10px;color:var(--muted)"></div>
  `;

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

  root.querySelector('#change-logo').addEventListener('click', async () => {
    const result = await api.pickLogo();
    if (!result.canceled) {
      state.logoPath = result.logoPath;
      renderSettings();
    }
  });

  root.querySelector('#save-api-key').addEventListener('click', async () => {
    const key = root.querySelector('#api-key').value.trim();
    const res = await api.updateApiKey(key);
    state.hasApiKey = !!res.hasApiKey;
    root.querySelector('#settings-info').textContent = 'API key updated and reloaded.';
    renderSettings();
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
