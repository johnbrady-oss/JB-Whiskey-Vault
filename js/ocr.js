// ocr.js — on-device label reading using Tesseract.js, loaded from a CDN the
// first time it's needed. Everything runs locally in the browser: the photo
// is never uploaded anywhere. This is genuinely useful for the printed
// numbers on a label (ABV, volume, age statement) but is a plain text
// reader, not a whiskey expert — it doesn't "know" what a distillery name
// looks like, so name/distillery guesses are best-effort and always shown
// alongside the raw scanned text so you can fix anything it got wrong.

const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the text-recognition library — check your connection'));
    document.head.appendChild(s);
  });
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (!window.Tesseract) await loadScript(TESSERACT_SRC);
      return window.Tesseract.createWorker('eng');
    })();
  }
  return workerPromise;
}

// Boilerplate label text that should never be mistaken for a bottle name.
const NAME_BLACKLIST = [
  'product of', 'produce of', 'imported by', 'distilled', 'bottled',
  'ireland', 'irish whiskey', 'irish whisky', 'warning', 'government',
  'drink responsibly', 'enjoy responsibly', 'contains sulphites',
  'please recycle', 'net contents', 'alcohol by volume', 'aged in',
  'matured in', 'family reserve', 'est.', 'since', 'whiskey', 'whisky',
];

const CATEGORY_KEYWORDS = [
  { match: /single\s*pot\s*still/i, value: 'Single Pot Still' },
  { match: /single\s*malt/i, value: 'Single Malt' },
  { match: /single\s*grain/i, value: 'Single Grain' },
  { match: /blended\s*pot\s*still/i, value: 'Blended Pot Still' },
  { match: /blended\s*(whisk[ea]y)?/i, value: 'Blended Whiskey' },
  { match: /poit[ií]n/i, value: 'Poitín' },
];

function looksLikeBoilerplate(line) {
  const l = line.toLowerCase();
  if (NAME_BLACKLIST.some((b) => l.includes(b))) return true;
  if (CATEGORY_KEYWORDS.some((c) => c.match.test(line))) return true;
  if (/\d{1,2}(?:[.,]\d)?\s*%/.test(line)) return true; // ABV line
  if (/\d+\s*m\s?l\b/i.test(line) || /\d+\s*c\s?l\b/i.test(line) || /\d(?:[.,]\d+)?\s*l\b(?!\w)/i.test(line)) return true; // volume line
  if (/\d{1,2}\s*[- ]?\s*(?:years?|yrs?)\b/i.test(line)) return true; // age line
  if (/^\d+[\d\s.,%()/]*$/.test(line)) return true; // mostly numbers/punctuation
  if (line.replace(/[^a-zA-Z]/g, '').length < 3) return true; // too little actual text
  return false;
}

export function parseLabelText(rawText) {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const result = { rawText, name: '', abv: '', volumeMl: '', age: '', category: '' };

  // ABV — first plausible percentage between 20 and 75.
  const abvMatches = [...rawText.matchAll(/(\d{1,2}(?:[.,]\d)?)\s*%/g)];
  for (const m of abvMatches) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (v >= 20 && v <= 75) { result.abv = v; break; }
  }

  // Volume — ml/cl/L, normalized to ml.
  const mlMatch = rawText.match(/(\d{2,4}(?:[.,]\d+)?)\s*m\s?l\b/i);
  const clMatch = rawText.match(/(\d{2,4}(?:[.,]\d+)?)\s*c\s?l\b/i);
  const lMatch = rawText.match(/(\d(?:[.,]\d+)?)\s*l\b(?!\w)/i);
  if (mlMatch) result.volumeMl = Math.round(parseFloat(mlMatch[1].replace(',', '.')));
  else if (clMatch) result.volumeMl = Math.round(parseFloat(clMatch[1].replace(',', '.')) * 10);
  else if (lMatch) result.volumeMl = Math.round(parseFloat(lMatch[1].replace(',', '.')) * 1000);

  // Age statement.
  const ageMatch = rawText.match(/(\d{1,2})\s*[- ]?\s*(?:years?|yrs?)\b/i);
  if (ageMatch) result.age = `${ageMatch[1]} Year`;

  // Category.
  for (const c of CATEGORY_KEYWORDS) {
    if (c.match.test(rawText)) { result.category = c.value; break; }
  }

  // Name guess — the longest non-boilerplate line, since a bottle's brand
  // name is usually printed larger/more prominently than everything else,
  // and longer OCR lines tend to correlate with the larger, cleaner text a
  // scanner reads best.
  const candidates = lines.filter((l) => !looksLikeBoilerplate(l));
  if (candidates.length) {
    // Prefer a line that isn't shouting in all-caps — brand names are often
    // the one bit of mixed-case text on an otherwise all-caps label — and
    // only fall back to the longest all-caps line if nothing else qualifies.
    const isShouting = (l) => l === l.toUpperCase() && /[A-Z]/.test(l);
    const mixedCase = candidates.filter((l) => !isShouting(l));
    const pool = mixedCase.length ? mixedCase : candidates;
    pool.sort((a, b) => b.length - a.length);
    result.name = pool[0]
      .replace(/\s{2,}/g, ' ')
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  }

  return result;
}

// Runs OCR on an image (File, Blob, or data URL) and returns parsed fields.
export async function scanLabelImage(image) {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  return parseLabelText(data.text || '');
}
