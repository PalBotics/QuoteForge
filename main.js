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

function isPackagedApp() {
  return app.isPackaged;
}

function getWritableEnvPath() {
  if (isPackagedApp()) {
    return path.join(app.getPath('userData'), APP_ENV_FILE);
  }
  return path.join(__dirname, APP_ENV_FILE);
}

function loadEnv() {
  const envPath = getWritableEnvPath();
  if (!fs.existsSync(envPath) && !isPackagedApp()) {
    const fallbackDev = path.join(__dirname, '.env');
    if (fs.existsSync(fallbackDev)) {
      dotenv.config({ path: fallbackDev, override: true });
    }
  } else {
    dotenv.config({ path: envPath, override: true });
  }

  const key = process.env.ANTHROPIC_API_KEY || '';
  currentApiKey = key;
  anthropicClient = key ? new Anthropic({ apiKey: key }) : null;
}

function getDataPath() {
  return path.join(app.getPath('userData'), DATA_FILE);
}

function defaultData() {
  return {
    quoteCounter: {
      date: '',
      seq: 0
    },
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
  if (!fs.existsSync(dataPath)) {
    await writeData(defaultData());
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fsp.readFile(getDataPath(), 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultData(),
      ...parsed,
      settings: {
        ...defaultData().settings,
        ...(parsed.settings || {})
      },
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
  const yyyy = `${now.getFullYear()}`;
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function normalizeDateIso() {
  const now = new Date();
  const yyyy = `${now.getFullYear()}`;
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function generateQuoteNumber() {
  const data = await readData();
  const today = todayYyyymmdd();
  const counter = data.quoteCounter || { date: '', seq: 0 };

  if (counter.date !== today) {
    counter.date = today;
    counter.seq = 1;
  } else {
    counter.seq += 1;
  }

  data.quoteCounter = counter;
  await writeData(data);
  const seq = `${counter.seq}`.padStart(2, '0');
  return `${today}-${seq}`;
}

function getActiveLogoPath() {
  const customLogo = path.join(app.getPath('userData'), USER_LOGO);
  if (fs.existsSync(customLogo)) {
    return customLogo;
  }
  return DEFAULT_LOGO;
}

function quoteAssistantSystemPrompt() {
  return [
    'You are Paul Lydick\'s quoting assistant for Draftek Design, LLC.',
    'Voice requirements: professional, practical, and direct. Use Paul\'s phrasing style such as "I have reviewed the work necessary..."',
    'The interaction should ask 2-4 clarifying questions per turn until scope is sufficiently defined.',
    'When not ready, continue asking focused scope questions with no JSON output.',
    'When the user asks to generate quote or scope is sufficiently defined, output ONLY valid JSON and no markdown fences.',
    'Use these benchmark ranges for estimates:',
    '- consultation: 4-12 hrs',
    '- concept design: 8-24 hrs',
    '- CAD simple part: 2-6 hrs',
    '- CAD complex part: 8-20 hrs',
    '- CAD small assembly: 16-40 hrs',
    '- CAD large assembly: 40-100 hrs',
    '- design review: 2-6 hrs',
    '- revisions per round: 4-16 hrs',
    '- detail drawing per part: 2-5 hrs',
    '- assembly drawing: 4-10 hrs',
    '- BOM: 2-8 hrs',
    '- testing plan: 8-20 hrs',
    '- documentation: 8-40 hrs',
    '- site visits: $1,500/day flat',
    'Required JSON shape exactly when ready:',
    '{"ready":true,"greeting":"Hi [FirstName],","scopeNarrative":"3-5 sentences in Paul\'s voice.","lineItems":[{"phase":"Phase Name","description":"What is included","hours":20,"rate":125,"cost":2500,"isFixed":false}],"deliverables":["item 1","item 2"],"timeline":"X-Y weeks ARO","paymentTerms":"Bi-weekly invoicing based on progress.","overflowRate":125,"notes":["any scope assumption or exclusion"],"nteTotal":2500}',
    'Rules:',
    '- For fixed-rate items (e.g., site visits), set isFixed true and omit hours/rate fields.',
    '- nteTotal must equal exact sum of all line item cost values.',
    '- Never include markdown code fences in final JSON output.'
  ].join('\n');
}

function stripCodeFences(text) {
  return text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
}

function extractFirstJsonObject(text) {
  const source = stripCodeFences(text);
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (start === -1) {
      if (char === '{') {
        start = i;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function validateReadyQuote(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JSON payload from AI.');
  }
  if (payload.ready !== true) {
    return;
  }
  if (!Array.isArray(payload.lineItems)) {
    throw new Error('Ready quote payload missing lineItems array.');
  }

  let sum = 0;
  for (const item of payload.lineItems) {
    if (typeof item.cost !== 'number') {
      throw new Error('Each line item requires numeric cost.');
    }
    if (item.isFixed === true) {
      delete item.hours;
      delete item.rate;
    } else {
      if (typeof item.hours !== 'number' || typeof item.rate !== 'number') {
        throw new Error('Non-fixed line items require numeric hours and rate.');
      }
    }
    sum += item.cost;
  }

  if (typeof payload.nteTotal !== 'number' || payload.nteTotal !== sum) {
    throw new Error('nteTotal must exactly equal the sum of all line item costs.');
  }
}

async function runQuoteChat({ messages, projectInfo, forceJson }) {
  if (!anthropicClient || !currentApiKey) {
    throw new Error('Anthropic API key is missing. Add it in Settings.');
  }

  const userPrompt = [
    'Project context:',
    JSON.stringify(projectInfo || {}, null, 2),
    '',
    'Conversation:',
    JSON.stringify(messages || [], null, 2),
    '',
    forceJson ? 'User requests final quote JSON now. Output JSON only.' : 'Continue with clarifying questions unless scope is complete.'
  ].join('\n');

  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 3000,
    system: quoteAssistantSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ]
  });

  const text = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const jsonChunk = extractFirstJsonObject(text);
  if (!jsonChunk) {
    return {
      ready: false,
      assistantText: text
    };
  }

  const parsed = JSON.parse(jsonChunk);
  validateReadyQuote(parsed);

  if (parsed.ready === true) {
    return {
      ready: true,
      quotePayload: parsed,
      assistantText: ''
    };
  }

  return {
    ready: false,
    assistantText: text
  };
}

async function savePdf({ html, quoteNumber }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Quote PDF',
    defaultPath: `Draftek_Design_Quote_${quoteNumber}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true
    }
  });

  await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pdfBuffer = await pdfWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'Letter'
  });
  pdfWindow.destroy();

  await fsp.writeFile(result.filePath, pdfBuffer);

  return {
    canceled: false,
    filePath: result.filePath
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1120,
    minHeight: 760,
    title: 'QuoteForge',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function setupIpc() {
  ipcMain.handle('app:get-initial-state', async () => {
    const data = await readData();
    return {
      data,
      logoPath: getActiveLogoPath(),
      hasApiKey: Boolean(currentApiKey)
    };
  });

  ipcMain.handle('app:generate-quote-number', async () => {
    const quoteNumber = await generateQuoteNumber();
    return quoteNumber;
  });

  ipcMain.handle('ai:chat-turn', async (_event, payload) => {
    return runQuoteChat(payload || {});
  });

  ipcMain.handle('pdf:save', async (_event, payload) => {
    return savePdf(payload || {});
  });

  ipcMain.handle('quotes:save-history', async (_event, payload) => {
    const data = await readData();
    const quote = {
      id: payload.id,
      date: payload.date || normalizeDateIso(),
      client: payload.client || {},
      project: payload.project || '',
      quoteData: payload.quoteData || {},
      status: VALID_STATUSES.includes(payload.status) ? payload.status : 'Draft'
    };

    data.quotes = data.quotes.filter((q) => q.id !== quote.id);
    data.quotes.push(quote);

    const client = payload.client || {};
    if (client.name) {
      const existing = data.clients.find((c) => c.name.toLowerCase() === client.name.toLowerCase());
      if (!existing) {
        data.clients.push({
          id: randomUUID(),
          name: client.name || '',
          title: client.title || '',
          company: client.company || '',
          phone: client.phone || '',
          address: client.address || ''
        });
      }
    }

    await writeData(data);
    return { ok: true };
  });

  ipcMain.handle('quotes:update-status', async (_event, { id, status }) => {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error('Invalid status value.');
    }
    const data = await readData();
    const target = data.quotes.find((q) => q.id === id);
    if (!target) {
      throw new Error('Quote not found.');
    }
    target.status = status;
    await writeData(data);
    return { ok: true };
  });

  ipcMain.handle('clients:add', async (_event, client) => {
    const data = await readData();
    const next = {
      id: randomUUID(),
      name: client.name || '',
      title: client.title || '',
      company: client.company || '',
      phone: client.phone || '',
      address: client.address || ''
    };
    data.clients.push(next);
    await writeData(data);
    return next;
  });

  ipcMain.handle('clients:update', async (_event, client) => {
    const data = await readData();
    const target = data.clients.find((c) => c.id === client.id);
    if (!target) {
      throw new Error('Client not found.');
    }
    Object.assign(target, {
      name: client.name || '',
      title: client.title || '',
      company: client.company || '',
      phone: client.phone || '',
      address: client.address || ''
    });
    await writeData(data);
    return target;
  });

  ipcMain.handle('clients:delete', async (_event, id) => {
    const data = await readData();
    data.clients = data.clients.filter((c) => c.id !== id);
    await writeData(data);
    return { ok: true };
  });

  ipcMain.handle('settings:save', async (_event, patch) => {
    const data = await readData();
    data.settings = {
      ...data.settings,
      ...(patch || {})
    };
    await writeData(data);
    return data.settings;
  });

  ipcMain.handle('settings:update-api-key', async (_event, apiKey) => {
    const envPath = getWritableEnvPath();
    await fsp.mkdir(path.dirname(envPath), { recursive: true });

    let content = '';
    if (fs.existsSync(envPath)) {
      content = await fsp.readFile(envPath, 'utf8');
    }

    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('ANTHROPIC_API_KEY='));
    lines.push(`ANTHROPIC_API_KEY=${apiKey || ''}`);

    await fsp.writeFile(envPath, `${lines.join('\n')}\n`, 'utf8');
    process.env.ANTHROPIC_API_KEY = apiKey || '';
    loadEnv();
    return { ok: true, hasApiKey: Boolean(currentApiKey) };
  });

  ipcMain.handle('logos:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Logo',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, logoPath: getActiveLogoPath() };
    }

    const selected = result.filePaths[0];
    const ext = path.extname(selected).toLowerCase();
    const target = path.join(app.getPath('userData'), USER_LOGO);

    if (!['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
      throw new Error('Unsupported logo format.');
    }

    await fsp.copyFile(selected, target);
    return { canceled: false, logoPath: target };
  });
}

app.whenReady().then(async () => {
  loadEnv();
  await ensureDataFile();
  setupIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
