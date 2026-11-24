const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const app = express();
const dir = path.join(__dirname, 'results');
const ttl = 24 * 60 * 60 * 1000;
const formats = ['jpeg', 'png', 'webp', 'avif'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 4 } });
let active = 0;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.post('/api/convert', (req, res, next) => {
  if (active >= 2) return res.status(503).json({ error: 'Сервер зайнятий. Спробуйте пізніше.' });
  active++;
  let released = false;
  const release = () => { if (!released) { released = true; active--; } };
  res.once('finish', release); res.once('close', release);
  next();
}, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Оберіть зображення.' });
  const { format, quality = '80', width = '', height = '' } = req.body;
  const q = Number(quality);
  const dimension = v => v === '' ? undefined : Number(v);
  const w = dimension(width), h = dimension(height);
  if (!formats.includes(format) || !Number.isInteger(q) || q < 1 || q > 100 || [w,h].some(v => v !== undefined && (!Number.isInteger(v) || v < 1 || v > 8000))) return res.status(400).json({ error: 'Некоректні параметри.' });
  try {
    let img = sharp(req.file.buffer, { limitInputPixels: 25000000 });
    const meta = await img.metadata();
    if (!['jpeg','png','webp','heif','avif'].includes(meta.format)) throw Error('format');
    img = img.rotate();
    if (w || h) img = img.resize(w, h, { fit: 'inside' });
    if (format === 'jpeg') img = img.flatten({ background: '#ffffff' });
    img = format === 'png' ? img.png({ compressionLevel: 9 }) : img.toFormat(format, { quality: q });
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    const id = randomUUID() + '.' + (format === 'jpeg' ? 'jpg' : format);
    await fs.writeFile(path.join(dir, id), data);
    res.json({ url: '/download/' + id, before: req.file.size, after: data.length, width: info.width, height: info.height });
  } catch { res.status(422).json({ error: 'Не вдалося обробити зображення. Перевірте формат і розміри.' }); }
});
app.get('/download/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|avif)$/.test(id)) return res.sendStatus(404);
  const file = path.join(dir, id);
  try { const stat = await fs.stat(file); if (Date.now() - stat.mtimeMs >= ttl) return res.sendStatus(410); res.download(file, 'converted.' + id.split('.').pop()); } catch { res.sendStatus(404); }
});
app.use((err, req, res, next) => { if (res.headersSent) return next(err); res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Максимальний розмір — 50 МБ.' : 'Помилка завантаження.' }); });
async function cleanup() { for (const name of await fs.readdir(dir)) { const file = path.join(dir, name); try { if (Date.now() - (await fs.stat(file)).mtimeMs >= ttl) await fs.unlink(file); } catch {} } }
(async () => { await fs.mkdir(dir, { recursive: true }); await cleanup(); setInterval(() => cleanup().catch(console.error), 60000).unref(); app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('CloudImage started')); })().catch(console.error);
