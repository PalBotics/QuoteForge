# QuoteForge — Project Status Document

**Generated:** 2026-03-29
**Repository:** [PalBotics/QuoteForge](https://github.com/PalBotics/QuoteForge)
**Latest Commit:** `582fd1c`
**Platform:** Electron desktop app, Windows-primary (Mac build config included)
**Purpose:** Standalone AI-powered engineering quote generator for Draftek Design, LLC (owner: Paul A. Lydick, Flemington, NJ)

---

## 1. Project Structure

```
C:\Users\Paul\Apps\QuoteForge\
├── main.js                  # Electron main process: IPC handlers, DOCX/PDF export, AI calls, file I/O
├── preload.js               # Context bridge: exposes safe IPC methods to renderer via window.quoteForgeApi
├── renderer/
│   ├── index.html           # App shell HTML: sidebar nav + section/step containers (no logic)
│   ├── app.js               # Entire renderer: state, all render functions, quote HTML builder, IPC calls
│   └── styles.css           # All UI styles: layout, nav, forms, chat bubbles, quote doc, responsive
├── assets/
│   └── draftek-logo.jpg     # Bundled fallback logo (1×1 placeholder; real logo stored in userData)
├── .env                     # ANTHROPIC_API_KEY=<value> — loaded by dotenv in main.js at startup
├── package.json             # Dependencies and npm scripts
├── package-lock.json        # Lockfile
├── electron-builder.yml     # Packaging config: NSIS installer (Windows), DMG (Mac)
├── QuoteForge_Status.md     # This file
├── test-output.docx         # Scratch test file from html-to-docx dev testing (not committed)
├── test-complex.docx        # Scratch test file (not committed)
├── test-full-quote.docx     # Scratch test file (not committed)
└── node_modules/            # Dependencies (not committed)
```

**Runtime data (not in repo — lives in `%APPDATA%\quoteforge\`):**
```
%APPDATA%\quoteforge\
├── quoteforge-data.json     # All persistent app data (quotes, clients, settings, counter)
├── custom-logo.png          # User-uploaded logo (may actually be JPEG despite .png extension)
└── .env                     # API key storage when running as packaged app
```

---

## 2. Dependencies

```json
{
  "name": "quoteforge",
  "version": "1.0.0",
  "description": "QuoteForge desktop quote generator for Draftek Design, LLC",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron .",
    "build": "electron-builder -c electron-builder.yml"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "docx": "^9.6.1",
    "dotenv": "^17.3.1",
    "html-to-docx": "^1.8.0",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "electron": "^41.0.4",
    "electron-builder": "^26.8.1"
  }
}
```

**Dependency notes:**
- `@anthropic-ai/sdk` — Used in main process to call `claude-sonnet-4-5` (3000 max tokens) for quote generation
- `docx` v9.6.1 — Used to generate `.docx` files; uses OOXML builder pattern (Document/Packer/Paragraph/TextRun/ImageRun/Table etc.)
- `html-to-docx` v1.8.0 — Installed but **not currently used** (was used in an earlier approach, replaced by `docx` library)
- `dotenv` — Loads `.env` at startup via `loadEnv()`; reloaded in-process when API key is updated in Settings
- `uuid` — Used in main process for generating client record UUIDs (`randomUUID` from Node crypto is used instead in practice)
- `electron` v41 — Dev dependency; `electron.exe` at `node_modules\electron\dist\electron.exe` is the dev launcher (used by the desktop shortcut)
- `electron-builder` — Dev dependency for packaging; outputs to `dist/`

**Desktop shortcut:** `C:\Users\Paul\Desktop\QuoteForge.lnk` — points to `node_modules\electron\dist\electron.exe` with `C:\Users\Paul\Apps\QuoteForge` as argument. This runs the dev version, not a packaged build.

---

## 3. Architecture Summary

### Process Model

```
┌─────────────────────────────────────────────────────────┐
│  MAIN PROCESS (main.js — Node.js / Electron)            │
│                                                         │
│  • Loads .env → initializes Anthropic client            │
│  • Reads/writes quoteforge-data.json                    │
│  • Handles all IPC requests from renderer               │
│  • Calls Anthropic API (claude-sonnet-4-5)              │
│  • Generates DOCX via docx library                      │
│  • Generates PDF via hidden BrowserWindow.printToPDF    │
│  • Opens native file dialogs                            │
│  • Manages logo file in userData                        │
└────────────────────┬────────────────────────────────────┘
                     │ ipcMain.handle / ipcRenderer.invoke
                     │ (contextIsolation: true, sandbox: false)
┌────────────────────▼────────────────────────────────────┐
│  PRELOAD (preload.js — contextBridge)                   │
│                                                         │
│  Exposes window.quoteForgeApi = {                       │
│    getInitialState, generateQuoteNumber, chatTurn,      │
│    savePdf, saveDocx, saveQuoteHistory,                 │
│    updateQuoteStatus, addClient, updateClient,          │
│    deleteClient, saveSettings, updateApiKey, pickLogo   │
│  }                                                      │
└────────────────────┬────────────────────────────────────┘
                     │ window.quoteForgeApi.*()
┌────────────────────▼────────────────────────────────────┐
│  RENDERER (renderer/app.js — browser JS, no Node)       │
│                                                         │
│  • Single-page app with section-based navigation        │
│  • Global `state` object (no framework)                 │
│  • All DOM manipulation via innerHTML + event listeners  │
│  • Draft persistence via localStorage                   │
│  • Quote HTML generated client-side by buildQuoteHtml() │
│  • iframe used for quote preview (srcdoc)               │
└─────────────────────────────────────────────────────────┘
```

### IPC Channels

| Channel | Direction | Handler | Purpose |
|---|---|---|---|
| `app:get-initial-state` | R→M | `readData()` + `getActiveLogoPath()` | Boot load: returns full data object, logoPath, hasApiKey |
| `app:generate-quote-number` | R→M | `generateQuoteNumber()` | Allocates next `YYYYMMDD-NN` quote ID and persists counter |
| `ai:chat-turn` | R→M | `runQuoteChat()` | Sends messages + project context to Anthropic API; returns `{ready, quotePayload, assistantText}` |
| `pdf:save` | R→M | `savePdf()` | Opens save dialog, spawns hidden BrowserWindow, calls printToPDF, writes file |
| `docx:save` | R→M | `saveDocx()` | Opens save dialog, reads logo bytes, detects format from magic bytes, computes aspect ratio, builds full OOXML document, writes file |
| `quotes:save-history` | R→M | inline handler | Upserts quote record by ID; silently adds client to address book if not duplicate |
| `quotes:update-status` | R→M | inline handler | Updates status field on a single quote record |
| `clients:add` | R→M | inline handler | Adds new client with UUID; checks for duplicate name+company or email |
| `clients:update` | R→M | inline handler | Updates existing client by ID; duplicate check excludes self |
| `clients:delete` | R→M | inline handler | Removes client by ID |
| `settings:save` | R→M | inline handler | Merges patch into settings object and persists |
| `settings:update-api-key` | R→M | inline handler | Rewrites `.env` file, updates `process.env`, calls `loadEnv()` to reinitialize Anthropic client |
| `logos:pick` | R→M | inline handler | Opens file picker (png/jpg/jpeg/svg), copies selected file to `userData/custom-logo.png` |

### Key Architectural Notes

- **API key security:** The API key is only accessible in the main process. The renderer has no access to it. The Settings section shows "API key is loaded from environment" or "No API key detected" — never the key value.
- **No framework:** The renderer uses vanilla JS with direct DOM manipulation and `innerHTML` template literals. There is no React, Vue, or build step.
- **Quote HTML is generated in renderer:** `buildQuoteHtml()` produces a complete self-contained HTML document (with inline `<style>`) used for both the iframe preview and PDF export. The DOCX export uses structured `quotePayload`/`projectForm`/`settings` data passed to the main process.
- **Draft recovery:** In-progress quotes are auto-saved to `localStorage` via `saveDraft()` after each state change. On startup, `tryRestoreDraft()` prompts the user to recover.
- **Logo handling:** The logo `file://` URL is used in the iframe preview. For PDF export, `embedLogoForPdf()` converts it to a base64 data URI before passing to the hidden print window. For DOCX, the logo file is read as a Buffer and embedded directly in the OOXML.
- **`renderSections()` is the top-level render dispatcher** — it reads `state.selectedSection` and calls the appropriate render function. Each render function fully rebuilds its section's innerHTML on every call.

---

## 4. Current Feature Status

### Section 1 — New Quote (3-step flow)

#### Step 1: Project Info Form
| Feature | Status |
|---|---|
| Client dropdown (select from address book) | ✅ Fully implemented |
| Auto-fill fields from selected client | ✅ Fully implemented |
| Enter new client inline | ✅ Fully implemented |
| All required fields (name, title, company, phone, email, address, project, description) | ✅ Fully implemented |
| Phone auto-format `(XXX) XXX-XXXX` | ✅ Fully implemented |
| Email validation on blur and on submit | ✅ Fully implemented |
| Services checklist (12 options) | ✅ Fully implemented |
| Hourly rate (default from settings) | ✅ Fully implemented |
| Quote validity days (default from settings) | ✅ Fully implemented |
| Validation: client name + project name required | ✅ Fully implemented |
| Quote number generation (YYYYMMDD-NN, daily counter) | ✅ Fully implemented |

#### Step 2: AI Scope Chat
| Feature | Status |
|---|---|
| Chat log display (user/assistant/error bubbles) | ✅ Fully implemented |
| Send message button | ✅ Fully implemented |
| "Generate Quote →" force-JSON button | ✅ Fully implemented |
| API call to `claude-sonnet-4-5` via IPC | ✅ Fully implemented |
| JSON extraction via bracket-counting parser (handles nested JSON) | ✅ Fully implemented |
| Strip markdown code fences from response | ✅ Fully implemented |
| Validate ready quote payload (nteTotal must equal sum of costs) | ✅ Fully implemented |
| Auto-advance to Step 3 when `ready: true` | ✅ Fully implemented |
| Red error bubbles for API failures | ✅ Fully implemented |
| Draft save after each turn | ✅ Fully implemented |

#### Step 3: Preview + Export
| Feature | Status |
|---|---|
| Quote preview in iframe (srcdoc) | ✅ Fully implemented |
| Inline line item editing (hours, rate, fixed cost) | ✅ Fully implemented |
| NTE total recalculates on line item edit | ✅ Fully implemented |
| Save PDF (printToPDF, native save dialog) | ✅ Fully implemented |
| Save to Word (.docx, full document with logo, all sections) | ✅ Fully implemented |
| Save to History | ✅ Fully implemented |
| Auto-add client to address book on save | ✅ Fully implemented |
| Word export: logo aspect ratio preserved via JPEG/PNG header parsing | ✅ Fully implemented |
| Error messaging for export failures | ✅ Fully implemented |

### Section 2 — Quote History

| Feature | Status |
|---|---|
| List all saved quotes, sorted by date descending | ✅ Fully implemented |
| Columns: quote #, client, project, date, NTE total, status | ✅ Fully implemented |
| Status badge (Draft/Sent/Accepted/Closed), persisted on change | ✅ Fully implemented |
| Click quote number → read-only preview in iframe | ✅ Fully implemented |
| Save PDF from history | ✅ Fully implemented |
| Save to Word from history | ✅ Fully implemented |
| Edit Quote → loads into Edit Quote section | ✅ Fully implemented |
| Save as New → clears quote number, loads into New Quote flow | ✅ Fully implemented |
| Revision system: Save as Revision appends letter suffix (e.g., `-a`, `-b`) | ✅ Fully implemented (in both Edit Quote and History) |

### Section 3 — Client Address Book

| Feature | Status |
|---|---|
| List all clients: name, company, phone, email, address | ✅ Fully implemented |
| Add new client | ✅ Fully implemented |
| Edit existing client | ✅ Fully implemented |
| Delete client | ✅ Fully implemented |
| Duplicate detection (same name+company OR same email) | ✅ Fully implemented (both client-side and server-side) |
| Phone auto-format | ✅ Fully implemented |
| Email validation | ✅ Fully implemented |
| Legacy address field backward compatibility | ✅ Handled via `normalizeClientContact()` |

### Section 4 — Settings

| Feature | Status |
|---|---|
| Business name, tagline, owner name, title | ✅ Fully implemented (auto-saves on field change) |
| Phone, address lines, city/state/zip | ✅ Fully implemented |
| Default hourly rate, default quote validity | ✅ Fully implemented |
| Current logo display | ✅ Fully implemented |
| Change logo (native file picker, copies to userData) | ✅ Fully implemented |
| Service rate schedule table (add/edit/remove rows, save) | ✅ Fully implemented |
| API key status indicator | ✅ Fully implemented |
| API key update field | ⚠️ **Partially implemented** — The `updateApiKey` IPC handler exists and works, but the Settings UI does **not** render an input field for entering/updating the API key. Users must edit `.env` manually. |

### Section 5 — Terms & Conditions (sidebar section)

| Feature | Status |
|---|---|
| Editable textarea for T&C text | ✅ Fully implemented |
| Saves to `settings.terms` via `settings:save` IPC | ✅ Fully implemented |
| T&C text used in quote HTML and DOCX export | ✅ Fully implemented |
| Default text provided as fallback | ✅ Fully implemented |

---

## 5. Data Layer

### File Location
```
%APPDATA%\quoteforge\quoteforge-data.json
```
On Windows: `C:\Users\<user>\AppData\Roaming\quoteforge\quoteforge-data.json`

### Schema

```json
{
  "quoteCounter": {
    "date": "20260327",
    "seq": 2
  },
  "quotes": [
    {
      "id": "20260327-02",
      "date": "2026-03-27",
      "client": {
        "name": "...",
        "title": "...",
        "company": "...",
        "phone": "...",
        "email": "...",
        "address1": "...",
        "address2": "...",
        "city": "...",
        "state": "NJ",
        "zip": "..."
      },
      "project": "Project Name",
      "quoteData": {
        "projectForm": {
          "clientId": "uuid-or-empty",
          "clientName": "...",
          "clientTitle": "...",
          "company": "...",
          "phone": "...",
          "email": "...",
          "address1": "...",
          "address2": "...",
          "city": "...",
          "state": "NJ",
          "zip": "...",
          "projectName": "...",
          "projectDescription": "...",
          "services": ["Mechanical Design", "CAD Modeling (SolidWorks)"],
          "hourlyRate": 125,
          "validityDays": 30
        },
        "quotePayload": {
          "ready": true,
          "greeting": "Hi FirstName,",
          "scopeNarrative": "3-5 sentences in Paul's voice.",
          "lineItems": [
            {
              "phase": "Phase Name",
              "description": "What is included",
              "hours": 20,
              "rate": 125,
              "cost": 2500,
              "isFixed": false
            }
          ],
          "deliverables": ["item 1", "item 2"],
          "timeline": "4-6 weeks ARO",
          "paymentTerms": "Bi-weekly invoicing based on progress.",
          "overflowRate": 125,
          "notes": ["scope assumption or exclusion"],
          "nteTotal": 2500
        },
        "quoteHtml": "<!doctype html>...",
        "logoPath": "C:\\Users\\Paul\\AppData\\Roaming\\quoteforge\\custom-logo.png"
      },
      "status": "Draft"
    }
  ],
  "clients": [
    {
      "id": "uuid-v4",
      "name": "...",
      "title": "...",
      "company": "...",
      "phone": "...",
      "email": "...",
      "address1": "...",
      "address2": "...",
      "city": "...",
      "state": "NJ",
      "zip": "...",
      "address": ""
    }
  ],
  "settings": {
    "businessName": "Draftek Design, LLC",
    "tagline": "Innovative Drafting and Design Services",
    "ownerName": "Paul A. Lydick",
    "ownerTitle": "President, Draftek Design, LLC",
    "phone": "908-829-5503",
    "address1": "17 Reaville Avenue",
    "address2": "Suite 1014",
    "cityStateZip": "Flemington, NJ 08822",
    "defaultRate": 125,
    "defaultValidity": 30,
    "terms": "Payment schedule: ...\nScope change rate: ...\n...",
    "rateSchedule": [
      { "category": "Design & Engineering", "activity": "Mechanical Design", "rate": 125 }
    ]
  }
}
```

### Read/Write Operations

All data operations go through two functions in `main.js`:

```javascript
async function readData()   // Always calls ensureDataFile() first; merges parsed data with defaultData() for forward compatibility; recovers from corrupt JSON
async function writeData(data)  // Writes pretty-printed JSON (2-space indent) atomically
```

`ensureDataFile()` creates the file on first run by calling `writeData(defaultData())`.

`readData()` uses a spread-merge pattern that applies defaults for any missing keys, making it safe to add new settings fields in future versions without breaking existing data files.

The `quoteCounter` object tracks `{ date: "YYYYMMDD", seq: N }`. The counter resets to 1 when the date changes, producing `YYYYMMDD-01`, `YYYYMMDD-02`, etc. Both read and write happen atomically within `generateQuoteNumber()`.

---

## 6. Known Issues and TODOs

### Bugs / Issues

| # | Severity | Description |
|---|---|---|
| 1 | Medium | **`renderSections()` has a missing closing brace.** The `renderEditQuote()` function is defined _inside_ `renderSections()` due to a missing `}` after the section dispatch block (line 280 in app.js). This works at runtime because JS hoists function declarations, but it is structurally incorrect and would cause lint errors. |
| 2 | Low | **`html-to-docx` is installed but unused.** It was used in an earlier approach and replaced. The dependency remains in `package.json` / `package-lock.json` and adds ~500KB to the installed footprint. |
| 3 | Low | **`custom-logo.png` is actually a JPEG.** When a user uploads a JPG logo, it is saved as `custom-logo.png` regardless of actual format. The PDF export uses the file extension for MIME type (`imageFileToDataUri`) so it will serve JPEG data with `image/png` MIME type. This works in practice because browsers and Electron's renderer are lenient, but it is technically incorrect. The DOCX export correctly detects format via magic bytes. |
| 4 | Low | **`address` legacy field is always empty string.** `buildClientRecord()` sets `address: input.address || ''`. Older code used a flat `address` field; the app now uses `address1/address2/city/state/zip`. The legacy field is carried along for compatibility but serves no purpose. |
| 5 | Low | **`validityDate` computed but not rendered in quote.** In `buildQuoteHtml()`, `const validityDate = addDays(...)` and `const tcPayment = quotePayload.paymentTerms || ...` are computed but neither variable is used in the returned HTML template. The Terms & Conditions text is rendered as a single block from `settings.terms`. |
| 6 | Low | **Settings section has no API key input field.** The `settings:update-api-key` IPC handler is fully implemented in main.js and exposed in preload.js, but `renderSettings()` in app.js does not render an input to use it. Users must edit `.env` manually. |
| 7 | Info | **`showRevisionControls()` is defined but never called.** The function at line 1219 in app.js builds a "Revision Controls" card in `#revision-controls` but is never invoked — the div is always empty. The revision save functionality is duplicated in `renderEditQuote()` via the "Save as Revision" button. |
| 8 | Info | **Three scratch `.docx` test files** (`test-output.docx`, `test-complex.docx`, `test-full-quote.docx`) exist in the project root from development testing. They are not in `.gitignore` but were not committed. They should be deleted or gitignored. |

### Potential Improvements (Not Started)

- Email delivery of quotes directly from the app
- Quote template system (save/load named templates)
- Search/filter in Quote History
- Export quote history to CSV
- Print button in quote preview
- Multi-page PDF pagination handling
- Dark mode
- Undo/redo in Edit Quote
- Quote expiration warnings in History

---

## 7. Key Code Excerpts

### `preload.js` (complete)

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quoteForgeApi', {
  getInitialState: () => ipcRenderer.invoke('app:get-initial-state'),
  generateQuoteNumber: () => ipcRenderer.invoke('app:generate-quote-number'),
  chatTurn: (payload) => ipcRenderer.invoke('ai:chat-turn', payload),
  savePdf: (payload) => ipcRenderer.invoke('pdf:save', payload),
  saveDocx: (payload) => ipcRenderer.invoke('docx:save', payload),
  saveQuoteHistory: (payload) => ipcRenderer.invoke('quotes:save-history', payload),
  updateQuoteStatus: (payload) => ipcRenderer.invoke('quotes:update-status', payload),
  addClient: (payload) => ipcRenderer.invoke('clients:add', payload),
  updateClient: (payload) => ipcRenderer.invoke('clients:update', payload),
  deleteClient: (id) => ipcRenderer.invoke('clients:delete', id),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  updateApiKey: (apiKey) => ipcRenderer.invoke('settings:update-api-key', apiKey),
  pickLogo: () => ipcRenderer.invoke('logos:pick')
});
```

---

### `renderer/index.html` (complete)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>QuoteForge</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">QuoteForge</div>
        <div class="sub-brand">Draftek Design</div>
        <nav id="nav-sections" class="nav-sections">
          <button data-section="newQuote" class="active">New Quote</button>
          <button data-section="history">Quote History</button>
          <button data-section="clients">Client Address Book</button>
          <button data-section="settings">Settings</button>
          <button data-section="terms">Terms &amp; Conditions</button>
        </nav>
      </aside>

      <main class="content">
        <section id="section-newQuote" class="section active">
          <header class="section-header">
            <h1>New Quote</h1>
            <p>AI-powered 3-step quote generation workflow.</p>
          </header>
          <div class="steps-row">
            <button id="step1-btn" class="step-btn active">1. Project Info</button>
            <button id="step2-btn" class="step-btn" disabled>2. AI Scope Chat</button>
            <button id="step3-btn" class="step-btn" disabled>3. Preview + Export</button>
          </div>
          <div id="step1" class="step-panel active"></div>
          <div id="step2" class="step-panel"></div>
          <div id="step3" class="step-panel"></div>
        </section>

        <section id="section-editQuote" class="section">
          <header class="section-header">
            <h1>Edit Quote</h1>
            <p>Edit all quote fields and line items in one place.</p>
          </header>
          <div id="edit-quote-root"></div>
        </section>

        <section id="section-history" class="section">
          <header class="section-header">
            <h1>Quote History</h1>
            <p>Saved quotes, statuses, and read-only previews.</p>
          </header>
          <div id="history-root"></div>
        </section>

        <section id="section-clients" class="section">
          <header class="section-header">
            <h1>Client Address Book</h1>
            <p>Add, edit, and remove client records.</p>
          </header>
          <div id="clients-root"></div>
        </section>

        <section id="section-settings" class="section">
          <header class="section-header">
            <h1>Settings</h1>
            <p>Business profile, defaults, logo, and API key.</p>
          </header>
          <div id="settings-root"></div>
        </section>

        <section id="section-terms" class="section">
          <header class="section-header">
            <h1>Terms &amp; Conditions</h1>
            <p>Add or modify the Terms &amp; Conditions that appear in all quotes.</p>
          </header>
          <div id="terms-root"></div>
        </section>
      </main>
    </div>

    <script src="./app.js"></script>
  </body>
</html>
```

---

### `main.js` (complete)

```javascript
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, ImageRun, WidthType, ShadingType, BorderStyle
} = require('docx');

function docxTr(run) { return new TextRun({ font: 'Georgia', size: 22, ...run }); }

function docxPara(runs, opts = {}) {
  return new Paragraph({ children: Array.isArray(runs) ? runs : [runs], ...opts });
}

function docxCell(paragraphs, { fill, span } = {}) {
  return new TableCell({
    children: paragraphs,
    columnSpan: span,
    verticalAlign: 'center',
    shading: fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 }
  });
}

async function saveDocx({ quoteNumber, quoteDate, logoPath, quotePayload, projectForm, settings }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Quote as Word Document',
    defaultPath: `Draftek_Design_Quote_${quoteNumber}.docx`,
    filters: [{ name: 'Word Document', extensions: ['docx'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  try {
    const NAVY = '042C53';
    const WHITE = 'FFFFFF';
    const GRAY = 'F8FAFC';
    const TC_BG = 'F0F4F8';
    const children = [];

    // ── Header: Logo (left) + Quote number (right) ──────────────────────────
    let logoImageRun = null;
    try {
      const activeLogo = logoPath || getActiveLogoPath();
      if (activeLogo && fs.existsSync(activeLogo)) {
        const imgBuf = await fsp.readFile(activeLogo);
        const isJpeg = imgBuf[0] === 0xFF && imgBuf[1] === 0xD8;
        const isPng  = imgBuf[0] === 0x89 && imgBuf[1] === 0x50;
        const imgType = isJpeg ? 'jpg' : isPng ? 'png' : null;
        if (imgType) {
          let imgW = 0, imgH = 0;
          if (isPng) {
            imgW = imgBuf.readUInt32BE(16);
            imgH = imgBuf.readUInt32BE(20);
          } else {
            let p = 2;
            while (p < imgBuf.length - 8) {
              if (imgBuf[p] !== 0xFF) { p++; continue; }
              const mk = imgBuf[p + 1];
              if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xCC) {
                imgH = (imgBuf[p + 5] << 8) | imgBuf[p + 6];
                imgW = (imgBuf[p + 7] << 8) | imgBuf[p + 8];
                break;
              }
              const segLen = (imgBuf[p + 2] << 8) | imgBuf[p + 3];
              p += 2 + segLen;
            }
          }
          const TARGET_W = 220;
          const displayH = (imgW > 0 && imgH > 0)
            ? Math.round(TARGET_W * imgH / imgW)
            : Math.round(TARGET_W * 0.44);
          logoImageRun = new ImageRun({ data: imgBuf, transformation: { width: TARGET_W, height: displayH }, type: imgType });
        }
      }
    } catch (_) {}

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } },
        rows: [new TableRow({ children: [
          docxCell([docxPara(logoImageRun ? [logoImageRun] : [docxTr({ text: settings.businessName || 'Draftek Design, LLC', bold: true, size: 26 })])], {}),
          docxCell([docxPara([docxTr({ text: `QUOTE: ${quoteNumber}`, bold: true, color: NAVY, size: 28 })], { alignment: AlignmentType.RIGHT })], {})
        ] })]
      })
    );

    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.THICK, size: 28, color: NAVY } },
      spacing: { before: 80, after: 160 }
    }));

    children.push(docxPara([
      docxTr({ text: 'Date: ', bold: true }),
      docxTr({ text: quoteDate || '' })
    ], { spacing: { after: 60 } }));

    if (projectForm.clientName) children.push(docxPara([docxTr({ text: projectForm.clientName || '', bold: true })], { spacing: { after: 0 } }));
    if (projectForm.clientTitle) children.push(docxPara([docxTr({ text: projectForm.clientTitle || '' })], { spacing: { after: 0 } }));
    if (projectForm.company) children.push(docxPara([docxTr({ text: projectForm.company || '' })], { spacing: { after: 0 } }));
    const addr1 = [projectForm.address1, projectForm.address2].filter(Boolean).join(', ');
    const addr2 = [projectForm.city, projectForm.state, projectForm.zip].filter(Boolean).join(' ');
    if (addr1) children.push(docxPara([docxTr({ text: addr1 })], { spacing: { after: 0 } }));
    if (addr2) children.push(docxPara([docxTr({ text: addr2 })], { spacing: { after: 0 } }));
    if (projectForm.phone) children.push(docxPara([docxTr({ text: projectForm.phone || '' })], { spacing: { after: 0 } }));
    if (projectForm.email) children.push(docxPara([docxTr({ text: projectForm.email || '' })], { spacing: { after: 100 } }));

    children.push(docxPara([
      docxTr({ text: 'Re: ', bold: true }),
      docxTr({ text: projectForm.projectName || '' })
    ], { spacing: { before: 80, after: 160 } }));

    children.push(docxPara([docxTr({ text: quotePayload.greeting || `Hi ${projectForm.clientName || ''},` })], { spacing: { after: 80 } }));
    children.push(docxPara([docxTr({ text: quotePayload.scopeNarrative || '' })], { spacing: { after: 160 } }));

    const hdrCell = (text) => docxCell([docxPara([docxTr({ text, bold: true, color: WHITE })], { alignment: AlignmentType.LEFT })], { fill: NAVY });
    const hdrCellR = (text) => docxCell([docxPara([docxTr({ text, bold: true, color: WHITE })], { alignment: AlignmentType.RIGHT })], { fill: NAVY });

    const tableRows = [
      new TableRow({ children: [hdrCell('Phase/Task'), hdrCell('Description'), hdrCellR('Est. Hrs'), hdrCellR('Rate'), hdrCellR('Cost')] })
    ];

    (quotePayload.lineItems || []).forEach((item, i) => {
      const rowFill = i % 2 === 1 ? GRAY : undefined;
      tableRows.push(new TableRow({ children: [
        docxCell([docxPara([docxTr({ text: item.phase || '' })])], { fill: rowFill }),
        docxCell([docxPara([docxTr({ text: item.description || '' })])], { fill: rowFill }),
        docxCell([docxPara([docxTr({ text: item.isFixed ? '' : String(item.hours || '') })], { alignment: AlignmentType.RIGHT })], { fill: rowFill }),
        docxCell([docxPara([docxTr({ text: item.isFixed ? '' : `$${Number(item.rate || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` })], { alignment: AlignmentType.RIGHT })], { fill: rowFill }),
        docxCell([docxPara([docxTr({ text: `$${Number(item.cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` })], { alignment: AlignmentType.RIGHT })], { fill: rowFill })
      ] }));
    });

    const nteFormatted = `$${Number(quotePayload.nteTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    tableRows.push(new TableRow({ children: [
      docxCell([docxPara([docxTr({ text: 'Not-to-Exceed Total', bold: true, color: WHITE })], {})], { fill: NAVY, span: 4 }),
      docxCell([docxPara([docxTr({ text: nteFormatted, bold: true, color: WHITE })], { alignment: AlignmentType.RIGHT })], { fill: NAVY })
    ] }));

    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
    children.push(new Paragraph({ spacing: { after: 120 } }));

    children.push(docxPara([docxTr({ text: 'Deliverables', bold: true })], { spacing: { before: 120, after: 60 } }));
    (quotePayload.deliverables || []).forEach(d => {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [docxTr({ text: d })], spacing: { after: 40 } }));
    });

    children.push(docxPara([
      docxTr({ text: 'Estimated Timeline: ', bold: true }),
      docxTr({ text: quotePayload.timeline || '' })
    ], { spacing: { before: 120, after: 120 } }));

    children.push(docxPara([docxTr({ text: 'I am looking forward to working with you on this project.' })], { spacing: { before: 120, after: 240 } }));
    children.push(docxPara([docxTr({ text: settings.ownerName || '', italics: true, font: 'Georgia' })], { spacing: { after: 0 } }));
    children.push(docxPara([docxTr({ text: settings.businessName || '' })], { spacing: { after: 0 } }));
    children.push(docxPara([docxTr({ text: settings.phone || '' })], { spacing: { after: 160 } }));

    const termsText = settings?.terms || defaultTermsText();
    children.push(docxPara([docxTr({ text: 'Terms & Conditions', bold: true })], {
      border: { left: { style: BorderStyle.THICK, size: 16, color: NAVY } },
      indent: { left: 200 },
      shading: { fill: TC_BG, type: ShadingType.CLEAR, color: 'auto' },
      spacing: { before: 0, after: 0 }
    }));
    termsText.split('\n').filter(l => l.trim()).forEach(line => {
      children.push(docxPara([docxTr({ text: line })], {
        border: { left: { style: BorderStyle.THICK, size: 16, color: NAVY } },
        indent: { left: 200 },
        shading: { fill: TC_BG, type: ShadingType.CLEAR, color: 'auto' },
        spacing: { after: 0 }
      }));
    });
    children.push(new Paragraph({ spacing: { after: 120 } }));

    const footerAddr = [settings.address1, settings.address2, settings.cityStateZip].filter(Boolean).join(', ');
    children.push(new Paragraph({
      children: [docxTr({ text: footerAddr, color: WHITE, size: 18 })],
      alignment: AlignmentType.CENTER,
      shading: { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' },
      spacing: { before: 320, after: 0 },
      border: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE } }
    }));

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Georgia', size: 22 } } } },
      sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children }]
    });

    const buffer = await Packer.toBuffer(doc);
    await fsp.writeFile(result.filePath, buffer);
    return { canceled: false, filePath: result.filePath };
  } catch (err) {
    return { canceled: true, error: 'Failed to generate Word document. ' + (err?.message || String(err)) };
  }
}

function defaultTermsText() {
  return 'Payment schedule: Bi-weekly invoicing based on progress.\nScope change rate: $125 per hour.\nQuote validity: This quote expires in 30 days.\nRetainer requirement: 50% retainer due at project start.';
}

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const dotenv = require('dotenv');
const { Anthropic } = require('@anthropic-ai/sdk');
const { randomUUID } = require('crypto');

const DATA_FILE = 'quoteforge-data.json';
const APP_ENV_FILE = '.env';
const DEFAULT_LOGO = path.join(__dirname, 'assets', 'draftek-logo.jpg');
const USER_LOGO = 'custom-logo.png';
const VALID_STATUSES = ['Draft', 'Sent', 'Accepted', 'Closed'];

let mainWindow;
let anthropicClient = null;
let currentApiKey = '';

function isPackagedApp() { return app.isPackaged; }

function getWritableEnvPath() {
  if (isPackagedApp()) return path.join(app.getPath('userData'), APP_ENV_FILE);
  return path.join(__dirname, APP_ENV_FILE);
}

function loadEnv() {
  const envPath = getWritableEnvPath();
  if (!fs.existsSync(envPath) && !isPackagedApp()) {
    const fallbackDev = path.join(__dirname, '.env');
    if (fs.existsSync(fallbackDev)) dotenv.config({ path: fallbackDev, override: true });
  } else {
    dotenv.config({ path: envPath, override: true });
  }
  const key = process.env.ANTHROPIC_API_KEY || '';
  currentApiKey = key;
  anthropicClient = key ? new Anthropic({ apiKey: key }) : null;
}

function getDataPath() { return path.join(app.getPath('userData'), DATA_FILE); }

function defaultData() {
  return {
    quoteCounter: { date: '', seq: 0 },
    quotes: [],
    clients: [],
    settings: {
      businessName: 'Draftek Design, LLC',
      tagline: 'Innovative Drafting and Design Services',
      ownerName: 'Paul A. Lydick',
      ownerTitle: 'President, Draftek Design, LLC',
      phone: '908-829-5503',
      address1: '17 Reaville Avenue',
      address2: 'Suite 1014',
      cityStateZip: 'Flemington, NJ 08822',
      defaultRate: 125,
      defaultValidity: 30
    }
  };
}

async function ensureDataFile() {
  const dataPath = getDataPath();
  await fsp.mkdir(path.dirname(dataPath), { recursive: true });
  if (!fs.existsSync(dataPath)) await writeData(defaultData());
}

async function readData() {
  await ensureDataFile();
  const raw = await fsp.readFile(getDataPath(), 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultData(),
      ...parsed,
      settings: { ...defaultData().settings, ...(parsed.settings || {}) },
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : []
    };
  } catch (_err) {
    const recovery = defaultData();
    await writeData(recovery);
    return recovery;
  }
}

async function writeData(data) {
  await fsp.writeFile(getDataPath(), JSON.stringify(data, null, 2), 'utf8');
}

function todayYyyymmdd() {
  const now = new Date();
  return `${now.getFullYear()}${`${now.getMonth()+1}`.padStart(2,'0')}${`${now.getDate()}`.padStart(2,'0')}`;
}

function normalizeDateIso() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth()+1}`.padStart(2,'0')}-${`${now.getDate()}`.padStart(2,'0')}`;
}

async function generateQuoteNumber() {
  const data = await readData();
  const today = todayYyyymmdd();
  const counter = data.quoteCounter || { date: '', seq: 0 };
  if (counter.date !== today) { counter.date = today; counter.seq = 1; }
  else { counter.seq += 1; }
  data.quoteCounter = counter;
  await writeData(data);
  return `${today}-${`${counter.seq}`.padStart(2, '0')}`;
}

function getActiveLogoPath() {
  const customLogo = path.join(app.getPath('userData'), USER_LOGO);
  if (fs.existsSync(customLogo)) return customLogo;
  return DEFAULT_LOGO;
}

function buildClientRecord(input = {}, withId = true) {
  return {
    ...(withId ? { id: input.id || randomUUID() } : {}),
    name: input.name || '', title: input.title || '', company: input.company || '',
    phone: input.phone || '', email: input.email || '',
    address1: input.address1 || input.address || '', address2: input.address2 || '',
    city: input.city || '', state: input.state || '', zip: input.zip || '',
    address: input.address || ''
  };
}

function normalizeText(value) { return `${value || ''}`.trim().toLowerCase(); }

function isDuplicateClient(clients, candidate, excludeId = '') {
  const name = normalizeText(candidate.name);
  const company = normalizeText(candidate.company);
  const email = normalizeText(candidate.email);
  return (clients || []).some((existing) => {
    if (excludeId && existing.id === excludeId) return false;
    const existingEmail = normalizeText(existing.email);
    if (email && existingEmail && email === existingEmail) return true;
    return Boolean(name) && normalizeText(existing.name) === name && normalizeText(existing.company) === company;
  });
}

function quoteAssistantSystemPrompt() {
  return [
    "You are Paul Lydick's quoting assistant for Draftek Design, LLC.",
    "Voice requirements: professional, practical, and direct. Use Paul's phrasing style such as \"I have reviewed the work necessary...\"",
    "The interaction should ask 2-4 clarifying questions per turn until scope is sufficiently defined.",
    "When not ready, continue asking focused scope questions with no JSON output.",
    "When the user asks to generate quote or scope is sufficiently defined, output ONLY valid JSON and no markdown fences.",
    "Use these benchmark ranges for estimates:",
    "- consultation: 4-12 hrs", "- concept design: 8-24 hrs",
    "- CAD simple part: 2-6 hrs", "- CAD complex part: 8-20 hrs",
    "- CAD small assembly: 16-40 hrs", "- CAD large assembly: 40-100 hrs",
    "- design review: 2-6 hrs", "- revisions per round: 4-16 hrs",
    "- detail drawing per part: 2-5 hrs", "- assembly drawing: 4-10 hrs",
    "- BOM: 2-8 hrs", "- testing plan: 8-20 hrs",
    "- documentation: 8-40 hrs", "- site visits: $1,500/day flat",
    'Required JSON shape exactly when ready:',
    '{"ready":true,"greeting":"Hi [FirstName],","scopeNarrative":"3-5 sentences in Paul\'s voice.","lineItems":[{"phase":"Phase Name","description":"What is included","hours":20,"rate":125,"cost":2500,"isFixed":false}],"deliverables":["item 1","item 2"],"timeline":"X-Y weeks ARO","paymentTerms":"Bi-weekly invoicing based on progress.","overflowRate":125,"notes":["any scope assumption or exclusion"],"nteTotal":2500}',
    'Rules:',
    '- For fixed-rate items (e.g., site visits), set isFixed true and omit hours/rate fields.',
    '- nteTotal must equal exact sum of all line item cost values.',
    '- Never include markdown code fences in final JSON output.'
  ].join('\n');
}

// ... (extractFirstJsonObject, validateReadyQuote, imageFileToDataUri,
//      embedLogoForPdf, runQuoteChat, savePdf, createWindow, setupIpc,
//      app.whenReady — see full source in main.js)
```

---

### `renderer/app.js` — Key Functions Reference

The full file is ~1,622 lines. Key function locations:

| Function | Line | Purpose |
|---|---|---|
| `escapeHtml()` | 87 | XSS prevention for all user-controlled values inserted into innerHTML |
| `saveDraft()` / `clearDraft()` / `tryRestoreDraft()` | 97–133 | localStorage draft persistence and recovery |
| `money()` | 135 | Currency formatter via `Intl.NumberFormat` |
| `recalculateQuotePayload()` | 225 | Recomputes `item.cost = hours * rate` for all non-fixed items; updates `nteTotal` |
| `renderSections()` | 256 | Top-level render dispatcher; calls the active section's render function |
| `renderEditQuote()` | 282 | Full quote editor (defined inside `renderSections` due to missing `}` — see Issue #1) |
| `renderTerms()` | 538 | T&C text editor; saves to `settings.terms` |
| `defaultTerms()` | 565 | Returns default T&C text string |
| `renderStep1()` | 569 | Project info form; client pre-fill from address book |
| `switchStep()` | 750 | Shows/hides step panels and updates step button active state |
| `renderStep2()` | 759 | AI chat interface; calls `api.chatTurn()`; handles ready/not-ready response |
| `buildQuoteHtml()` | 825 | Generates complete self-contained HTML quote document for iframe/PDF |
| `renderStep3()` | 926 | Quote preview + line item editor + export buttons |
| `renderHistory()` | 1088 | Quote history table + read-only preview panel |
| `renderClients()` | 1287 | Client address book table + add/edit form |
| `renderSettings()` | 1447 | Settings form + rate schedule table + logo picker |
| `refreshState()` | 1597 | Calls `api.getInitialState()` and updates `state.data`, `state.logoPath`, `state.hasApiKey` |
| `init()` | 1614 | App entry point: `refreshState()` → `wireNavigation()` → `wireStepButtons()` → `renderSections()` |

---

### `renderer/styles.css` — CSS Variables

```css
:root {
  --navy:      #042c53;   /* Primary brand color, headers, nav active, table headers, T&C border */
  --navy-deep: #021a32;   /* Sidebar gradient end */
  --mist:      #f3f5f8;   /* Light section backgrounds */
  --surface:   #ffffff;   /* Card backgrounds, step panels */
  --line:      #d9dee5;   /* All borders, table cell borders */
  --error:     #b42318;   /* Error bubbles, danger buttons */
  --text:      #111827;   /* Primary text */
  --muted:     #4b5563;   /* Labels, helper text, info messages */
}
```

---

## 8. Build & Run

### Development
```bash
cd C:\Users\Paul\Apps\QuoteForge
npm start        # or npm run dev
```
Or double-click `C:\Users\Paul\Desktop\QuoteForge.lnk` (points to `node_modules\electron\dist\electron.exe`).

### Production Build
```bash
npm run build
# Output: dist/QuoteForge-1.0.0-setup.exe (Windows NSIS installer)
#         dist/QuoteForge-1.0.0.dmg        (Mac, optional)
```

**electron-builder.yml:**
```yaml
appId: com.draftek.quoteforge
productName: QuoteForge
files:
  - main.js
  - preload.js
  - renderer/**
  - assets/**
  - package.json
extraMetadata:
  main: main.js
directories:
  output: dist
win:
  target:
    - nsis
  artifactName: QuoteForge-${version}-setup.${ext}
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
mac:
  target:
    - dmg
  artifactName: QuoteForge-${version}.${ext}
```

**Important:** When running as a packaged app, the `.env` file is stored in `userData` (not the install directory). The `loadEnv()` function handles both cases via `isPackagedApp()`.

---

*End of QuoteForge Status Document*
