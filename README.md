# Whiskey Vault

A personal Irish whiskey collection and inventory tracker, built as a web app
so it installs on your iPhone home screen and uses your camera to scan
barcodes — no App Store, no Mac, no developer account required.

## What it does

- Scan a bottle's existing retail barcode with your camera, or generate and
  print your own QR label for bottles that don't have one.
- Every barcode is remembered locally, so scanning the same bottle again
  instantly pulls up its record.
- Take or choose a photo of the label and tap "Read label & fill fields in"
  to have the app read the printed text on-device (no photo ever leaves your
  phone) and pre-fill ABV, volume, age statement, and category, plus a best
  guess at the name. This is plain text recognition, not a whiskey expert —
  it's reliably good at the printed numbers, and only a best-effort guess at
  the name/distillery, so always double-check what it fills in. The raw
  scanned text is shown underneath so you can fix anything it missed.
- Track distillery, category (single malt, single pot still, single grain,
  blended, etc.), age statement, ABV, volume, purchase price, estimated
  current value, status (sealed / open / finished / gifted), fill level for
  opened bottles, rating, tasting notes, and a photo.
- A stats tab shows total bottles, money invested, estimated collection
  value, and a breakdown by distillery and status.
- Works fully offline once installed, except the one-time online lookup it
  attempts for unrecognized retail barcodes (best-effort only — most craft
  and limited-release Irish whiskeys aren't in any public barcode database,
  so you'll often just fill the details in by hand once).
- All data stays on your phone, in your browser. Nothing is uploaded
  anywhere. Use Settings → Export backup regularly, since there's no cloud
  sync — an export is the only way to move your data to a new phone or
  recover it if the browser data is ever cleared.

## Why it needs to be hosted somewhere (quick, free, one-time)

iPhone Safari only allows camera access and "Add to Home Screen" installs
for pages served over HTTPS — not for a plain file opened directly on your
phone. So this needs a real (free) web address. Two options, pick whichever
you're more comfortable with:

### Option A — GitHub Pages (if you already have, or don't mind making, a free GitHub account)

1. Go to github.com and create a new repository (any name, e.g. `whiskey-vault`).
2. Upload every file in this folder to the repository, keeping the folder
   structure intact (`index.html` at the root, `css/`, `js/`, `icons/`, etc.)
   — easiest via the "Add file → Upload files" button in the GitHub web UI,
   dragging the whole folder in.
3. In the repository, go to Settings → Pages, set the source to the `main`
   branch, root folder, and save.
4. After a minute, GitHub gives you a URL like
   `https://yourusername.github.io/whiskey-vault/`. Open that on your
   iPhone in Safari.

### Option B — Netlify (also free, drag-and-drop)

1. Go to netlify.com and sign up for a free account.
2. From your dashboard, drag the whole `whiskey-vault` folder onto the
   deploy area.
3. Netlify gives you a live HTTPS URL immediately (something like
   `https://random-name-1234.netlify.app`). Open that on your iPhone in
   Safari. You can rename the site to something memorable from the site
   settings.

## Installing it on your iPhone

1. Open the URL from whichever option above in **Safari** (must be Safari,
   not Chrome, for the install step).
2. Tap the Share icon (square with an arrow) in the toolbar.
3. Tap "Add to Home Screen."
4. Launch it from the home screen icon from then on — it opens full-screen,
   like a regular app, and will ask for camera permission the first time you
   tap Scan.

## Making changes later

Everything is plain HTML/CSS/JavaScript with no build step. Edit the files
directly and re-upload/re-drag them to GitHub Pages or Netlify to update the
live version — Claude can also help you make further changes any time,
just describe what you'd like adjusted.
