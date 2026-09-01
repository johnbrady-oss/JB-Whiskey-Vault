// scanner.js — camera-based barcode scanning via ZXing (loaded from a CDN as
// an ES module) plus a best-effort, optional online lookup for retail UPC
// barcodes. Safari on iOS has no native barcode API, so we decode frames
// from the video stream ourselves; this is a little less snappy than a
// native app's scanner but works reliably if you hold the bottle steady
// with the barcode filling most of the frame.

let readerPromise = null;
async function getReader() {
  if (!readerPromise) {
    readerPromise = import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm')
      .then(({ BrowserMultiFormatReader }) => new BrowserMultiFormatReader());
  }
  return readerPromise;
}

export const Scanner = {
  _controls: null,

  // Starts the camera and calls onDetect(text, format) for every decoded
  // barcode until stop() is called. videoEl is a <video> element already in
  // the DOM. Returns nothing; throws if camera access is denied.
  async start(videoEl, onDetect, onError) {
    const reader = await getReader();
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };
    this._controls = await reader.decodeFromConstraints(
      constraints,
      videoEl,
      (result, err) => {
        if (result) onDetect(result.getText(), result.getBarcodeFormat());
        // NotFoundException fires continuously between successful decodes —
        // that's normal, not an error worth surfacing.
        else if (err && err.name !== 'NotFoundException' && onError) onError(err);
      }
    );
  },

  stop() {
    if (this._controls) {
      try { this._controls.stop(); } catch (e) { /* already stopped */ }
      this._controls = null;
    }
  },
};

// Best-effort product lookup for a retail UPC/EAN barcode. This hits a free,
// keyless public API. It's not reliable for craft/limited-release Irish
// whiskey (many aren't in any public database), and it can fail outright if
// you're offline or the API blocks browser requests (CORS) — either way we
// fail silently and just let you fill the bottle details in by hand. Once
// you've entered a bottle once, its barcode is remembered locally forever,
// so this lookup is only ever needed the first time you see a given bottle.
export async function lookupBarcode(barcode) {
  return (await lookupUpcItemDb(barcode)) || (await lookupOpenFoodFacts(barcode));
}

async function lookupUpcItemDb(barcode) {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data && data.items && data.items[0];
    if (!item) return null;
    return {
      name: item.title || '',
      brand: item.brand || '',
      image: (item.images && item.images[0]) || null,
    };
  } catch (e) {
    return null; // offline, CORS-blocked, or rate-limited — that's fine
  }
}

// Second attempt: Open Food Facts also indexes some beverages by barcode and
// allows direct browser calls. Coverage for whiskey is spotty (it's mainly a
// food database) but it's free and worth trying before giving up.
async function lookupOpenFoodFacts(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const product = data && data.product;
    if (!product || data.status !== 1) return null;
    return {
      name: product.product_name || '',
      brand: (product.brands || '').split(',')[0].trim(),
      image: product.image_url || null,
    };
  } catch (e) {
    return null;
  }
}
