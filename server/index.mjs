// Сервер «Памяти поколений»: оплата в Telegram Stars, заявки на тариф СВО,
// резервные копии записей. Node 18+, без зависимостей.
//
// Переменные окружения (см. server/README.md):
//   BOT_TOKEN       — токен бота от @BotFather (обязательно)
//   ADMIN_CHAT_ID   — ваш chat id: сюда приходят заявки СВО и команды /grant /deny /refund
//   PUBLIC_URL      — внешний https-адрес сервера, для вебхука бота
//   WEBHOOK_SECRET  — любая длинная случайная строка
//   ALLOWED_ORIGIN  — адрес приложения, например https://ki4iroo.github.io
//   APP_URL         — ссылка на Mini App, например https://t.me/kinmory_bot/memory
//   PRICE_STARS     — цена вечного хранения в Stars (по умолчанию 1000)
//   TEST_PAYMENTS   — 1: тестовый режим, оплата подтверждается без списания Stars
//   DATA_DIR        — папка для данных (по умолчанию ./data)
//   PORT            — порт (по умолчанию 8080)

import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

const env = process.env;
const BOT_TOKEN = env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error('BOT_TOKEN is required'); process.exit(1); }
const ADMIN_CHAT_ID = env.ADMIN_CHAT_ID ? Number(env.ADMIN_CHAT_ID) : null;
const PRICE_STARS = Number(env.PRICE_STARS || 1000);
const TEST_PAYMENTS = env.TEST_PAYMENTS === '1';
const DATA_DIR = path.resolve(env.DATA_DIR || './data');
const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || '';
const PORT = Number(env.PORT || 8080);
const INIT_DATA_MAX_AGE = 24 * 3600;
const MAX_BLOB = 300 * 1024 * 1024;
const MAX_META = 60 * 1024 * 1024;
const MAX_JSON = 64 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PAID = new Set(['paid', 'svo']);

// ---------- Telegram ----------

async function tgApi(method, params) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

const notifyAdmin = (text) => (ADMIN_CHAT_ID ? tgApi('sendMessage', { chat_id: ADMIN_CHAT_ID, text }).catch((e) => console.error(e)) : null);
const sendTo = (chatId, text, extra = {}) => tgApi('sendMessage', { chat_id: chatId, text, ...extra }).catch((e) => console.error(e));

// Проверка подписи initData: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const webAppSecret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
function verifyInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const expected = createHmac('sha256', webAppSecret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE) return null;
  try {
    const user = JSON.parse(params.get('user'));
    return Number.isSafeInteger(user?.id) ? user : null;
  } catch { return null; }
}

// ---------- Хранилище ----------

const userDir = (id) => path.join(DATA_DIR, 'users', String(id));
const blobPath = (id, blobId) => path.join(userDir(id), 'blobs', blobId);

async function writeAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

// Записи об одном пользователе меняются по очереди, чтобы не потерять обновления
const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => {}));
  return next;
}

const accountFile = (id) => path.join(userDir(id), 'account.json');
const getAccount = (id) => readJson(accountFile(id), { plan: 'free' });
const updateAccount = (id, fn) => withLock(`acc:${id}`, async () => {
  const next = await fn(await getAccount(id));
  await writeAtomic(accountFile(id), JSON.stringify(next, null, 2));
  return next;
});

function publicAccount(acc) {
  return {
    plan: acc.plan || 'free',
    consent: Boolean(acc.consentAt),
    svo: acc.svo ? { status: acc.svo.status } : null,
    priceStars: PRICE_STARS,
    testPayments: TEST_PAYMENTS,
  };
}

// ---------- HTTP ----------

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req, limit = MAX_JSON) {
  try { return JSON.parse((await readBody(req, limit)).toString('utf8') || '{}'); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'bad json'); }
}

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': isBuf ? 'application/octet-stream' : 'application/json', ...headers });
  res.end(isBuf ? body : JSON.stringify(body ?? {}));
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && origin === ALLOWED_ORIGIN) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('access-control-max-age', '86400');
  }
}

function auth(req) {
  const header = req.headers.authorization || '';
  const user = header.startsWith('tma ') ? verifyInitData(header.slice(4)) : null;
  if (!user) throw new HttpError(401, 'unauthorized');
  return user;
}

async function requireBackup(user) {
  const acc = await getAccount(user.id);
  if (!PAID.has(acc.plan)) throw new HttpError(402, 'payment required');
  if (!acc.consentAt) throw new HttpError(403, 'consent required');
  return acc;
}

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Ссылки на аудио из метаданных — чтобы удалить с сервера записи, которых больше нет
function referencedBlobs(meta) {
  const ids = new Set();
  for (const r of meta.relatives || []) if (ID_RE.test(r?.audioId || '')) ids.add(r.audioId);
  for (const s of meta.stories || []) if (ID_RE.test(s?.audioId || '')) ids.add(s.audioId);
  return ids;
}

async function api(req, res, url) {
  const user = auth(req);
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/me') return send(res, 200, publicAccount(await getAccount(user.id)));

  if (route === 'POST /api/consent') {
    const acc = await updateAccount(user.id, (a) => ({ ...a, consentAt: a.consentAt || new Date().toISOString() }));
    return send(res, 200, publicAccount(acc));
  }

  if (route === 'POST /api/invoice') {
    const acc = await getAccount(user.id);
    if (PAID.has(acc.plan)) throw new HttpError(409, 'already paid');
    if (TEST_PAYMENTS) return send(res, 200, { test: true });
    const link = await tgApi('createInvoiceLink', {
      title: 'Сохрани голос родных навсегда',
      description: 'Резервная копия всех историй и голосовых записей на сервере. Восстановление на любом телефоне. Оплата один раз.',
      payload: `lifetime:${user.id}`,
      currency: 'XTR',
      prices: [{ label: 'Вечное хранение', amount: PRICE_STARS }],
    });
    return send(res, 200, { link });
  }

  // Тестовая оплата: тот же результат, что после настоящего платежа, но без Stars
  if (route === 'POST /api/test-pay' && TEST_PAYMENTS) {
    const acc = await updateAccount(user.id, (a) => (PAID.has(a.plan) ? a : { ...a, plan: 'paid', paidAt: new Date().toISOString(), chargeId: `test-${Date.now()}`, paidStars: 0, test: true }));
    notifyAdmin(`Тестовая оплата от ${user.first_name || ''} (id ${user.id})`);
    return send(res, 200, publicAccount(acc));
  }

  if (route === 'POST /api/svo-request') {
    const body = await readJsonBody(req);
    const who = body.who === 'family' ? 'family' : 'participant';
    const name = clean(body.name, 200);
    const comment = clean(body.comment, 1000);
    if (!name) throw new HttpError(400, 'name required');
    const acc = await updateAccount(user.id, (a) => {
      if (PAID.has(a.plan)) return a;
      return { ...a, svo: { status: 'pending', who, name, comment, at: new Date().toISOString() } };
    });
    if (acc.svo?.status === 'pending') {
      const tgName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      notifyAdmin([
        `Заявка на тариф СВО`,
        `${who === 'family' ? 'Член семьи участника' : 'Участник'}: ${name}`,
        `Telegram: ${tgName}${user.username ? ' @' + user.username : ''} (id ${user.id})`,
        comment ? `Комментарий: ${comment}` : null,
        '',
        `Одобрить: /grant ${user.id}`,
        `Отклонить: /deny ${user.id}`,
      ].filter((l) => l !== false && l !== null).join('\n'));
    }
    return send(res, 200, publicAccount(acc));
  }

  if (route === 'GET /api/blobs') {
    await requireBackup(user);
    let ids = [];
    try { ids = (await readdir(path.join(userDir(user.id), 'blobs'))).filter((f) => ID_RE.test(f)); } catch {}
    return send(res, 200, { ids });
  }

  const blobMatch = /^\/api\/blobs\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
  if (blobMatch) {
    await requireBackup(user);
    const file = blobPath(user.id, blobMatch[1]);
    if (req.method === 'PUT') {
      const data = await readBody(req, MAX_BLOB);
      const type = /^audio\/[\w.+-]+(;\s*codecs=[\w.,+" -]+)?$/i.test(req.headers['content-type'] || '') ? req.headers['content-type'] : 'audio/webm';
      await writeAtomic(file, data);
      await writeAtomic(`${file}.type`, type);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      try {
        const [data, type] = await Promise.all([readFile(file), readFile(`${file}.type`, 'utf8').catch(() => 'audio/webm')]);
        return send(res, 200, data, { 'content-type': type });
      } catch { throw new HttpError(404, 'not found'); }
    }
  }

  if (url.pathname === '/api/meta') {
    await requireBackup(user);
    const file = path.join(userDir(user.id), 'meta.json');
    if (req.method === 'GET') return send(res, 200, await readJson(file, { relatives: [], stories: [] }));
    if (req.method === 'PUT') {
      const meta = await readJsonBody(req, MAX_META);
      if (!Array.isArray(meta.relatives) || !Array.isArray(meta.stories)) throw new HttpError(400, 'bad meta');
      await withLock(`meta:${user.id}`, async () => {
        await writeAtomic(file, JSON.stringify({ relatives: meta.relatives, stories: meta.stories, savedAt: new Date().toISOString() }));
        const keep = referencedBlobs(meta);
        let files = [];
        try { files = await readdir(path.join(userDir(user.id), 'blobs')); } catch {}
        for (const f of files) {
          const id = f.replace(/\.type$/, '');
          if (ID_RE.test(id) && !keep.has(id)) await unlink(path.join(userDir(user.id), 'blobs', f)).catch(() => {});
        }
      });
      return send(res, 200, { ok: true });
    }
  }

  if (route === 'DELETE /api/data') {
    await rm(path.join(userDir(user.id), 'blobs'), { recursive: true, force: true });
    await rm(path.join(userDir(user.id), 'meta.json'), { force: true });
    return send(res, 200, { ok: true });
  }

  throw new HttpError(404, 'not found');
}

// ---------- Бот ----------

const HELP_SUPPORT = 'По вопросам оплаты напишите нам в этот чат — ответим в течение суток. Если что-то пошло не так, вернём Stars.';
const TERMS = 'Оплата один раз даёт бессрочное хранение резервной копии ваших историй и записей на нашем сервере в России. Записи всегда остаются и на вашем устройстве. Возврат — по запросу через /paysupport.';

async function handleUpdate(update) {
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const acc = await getAccount(q.from.id);
    const ok = q.invoice_payload === `lifetime:${q.from.id}` && q.currency === 'XTR' && q.total_amount === PRICE_STARS && !PAID.has(acc.plan);
    await tgApi('answerPreCheckoutQuery', ok
      ? { pre_checkout_query_id: q.id, ok: true }
      : { pre_checkout_query_id: q.id, ok: false, error_message: 'Платёж уже получен или цена изменилась. Откройте приложение заново.' });
    return;
  }

  const msg = update.message;
  if (!msg) return;

  if (msg.successful_payment) {
    const p = msg.successful_payment;
    const userId = msg.from.id;
    if (p.invoice_payload !== `lifetime:${userId}`) return;
    await updateAccount(userId, (a) => ({ ...a, plan: 'paid', paidAt: new Date().toISOString(), chargeId: p.telegram_payment_charge_id, paidStars: p.total_amount }));
    await sendTo(msg.chat.id, 'Спасибо! Голоса ваших родных теперь хранятся навсегда. Вернитесь в приложение — копия начнёт сохраняться сама.');
    notifyAdmin(`Оплата ${p.total_amount} ⭐ от ${msg.from.first_name || ''} (id ${userId})`);
    return;
  }

  const text = (msg.text || '').trim();
  const isAdmin = ADMIN_CHAT_ID && msg.chat.id === ADMIN_CHAT_ID;

  const cmd = /^\/(grant|deny|refund)\s+(\d+)$/.exec(text);
  if (cmd && isAdmin) {
    const [, action, idStr] = cmd;
    const id = Number(idStr);
    if (action === 'grant') {
      await updateAccount(id, (a) => ({ ...a, plan: PAID.has(a.plan) ? a.plan : 'svo', svo: { ...(a.svo || {}), status: 'approved', decidedAt: new Date().toISOString() } }));
      await sendTo(id, 'Ваша заявка одобрена: хранение на сервере для вас бесплатно. Спасибо за службу. Откройте приложение и включите копию в настройках.');
    } else if (action === 'deny') {
      await updateAccount(id, (a) => ({ ...a, svo: { ...(a.svo || {}), status: 'denied', decidedAt: new Date().toISOString() } }));
      await sendTo(id, 'Мы не смогли подтвердить заявку на бесплатный тариф. Напишите в этот чат, если хотите уточнить.');
    } else {
      const acc = await getAccount(id);
      if (!PAID.has(acc.plan)) { await sendTo(msg.chat.id, 'Нет оплаты для возврата'); return; }
      // Настоящий платёж возвращаем через Telegram; тестовый или тариф СВО просто сбрасываем
      if (acc.plan === 'paid' && acc.chargeId && !acc.chargeId.startsWith('test-')) {
        await tgApi('refundStarPayment', { user_id: id, telegram_payment_charge_id: acc.chargeId });
      }
      await updateAccount(id, (a) => ({ ...a, plan: 'free', chargeId: null, test: false, svo: null, refundedAt: new Date().toISOString() }));
    }
    await sendTo(msg.chat.id, `Готово: ${action} ${id}`);
    return;
  }

  if (text === '/paysupport') { await sendTo(msg.chat.id, HELP_SUPPORT); notifyAdmin(`Вопрос по оплате от id ${msg.from.id} @${msg.from.username || '-'}`); return; }
  if (text === '/terms') { await sendTo(msg.chat.id, TERMS); return; }
  if (text.startsWith('/start')) {
    await sendTo(msg.chat.id, 'Память поколений — сохраните голоса и истории своих родных.', env.APP_URL
      ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть приложение', url: env.APP_URL }]] } }
      : {});
  }
}

// ---------- Запуск ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/bot/webhook' && req.method === 'POST') {
      const secret = req.headers['x-telegram-bot-api-secret-token'] || '';
      if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) throw new HttpError(401, 'bad secret');
      const update = await readJsonBody(req, 1024 * 1024);
      await handleUpdate(update);
      return send(res, 200, { ok: true });
    }
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    throw new HttpError(404, 'not found');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'server error' : e.message });
  }
});

server.listen(PORT, async () => {
  console.log(`Server on :${PORT}, data in ${DATA_DIR}${TEST_PAYMENTS ? ', TEST PAYMENTS' : ''}`);
  if (env.PUBLIC_URL && env.WEBHOOK_SECRET) {
    try {
      await tgApi('setWebhook', { url: `${env.PUBLIC_URL.replace(/\/$/, '')}/bot/webhook`, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'pre_checkout_query'] });
      console.log('Webhook set');
    } catch (e) { console.error('Webhook failed:', e.message); }
  }
});
