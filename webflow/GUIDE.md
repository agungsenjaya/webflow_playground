# Panduan Migrasi ke Webflow

Replica 1:1 aplikasi React (coverflow slider video tutorial miniatur) ke page Webflow.
Data CMS `list-video-tutorials` sudah ada (24 item), image slider sudah di-upload.

> File pendukung (di folder `webflow/` repo ini):
> - `embed.js` — semua logic interaksi (coverflow, filter, dialog, bahasa)
> - `template.html` — referensi struktur DOM + posisi `vw` yang harus dibangun di Designer

---

## Daftar Isi
1. [Persiapan](#1-persiapan)
2. [Bangun Struktur Page](#2-bangun-struktur-page)
3. [Hidden Collection List (Data Source)](#3-hidden-collection-list-data-source)
4. [Background & UI Chrome](#4-background--ui-chrome)
5. [Coverflow Container](#5-coverflow-container)
6. [Dialog Overlay](#6-dialog-overlay)
7. [Pasang Custom Code](#7-pasang-custom-code)
8. [Publish & Test](#8-publish--test)
9. [Referensi Class & Posisi](#9-referensi-class--posisi)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Persiapan

### Yang harus sudah benar di CMS
- ✅ Collection `list-video-tutorials` dengan field: `Name`, `Slug`, `Category`, `Materials`, `Scales`, `Image`, `Videos EN`, `Videos ES`.
- ✅ Field `Videos EN` / `Videos ES` → **Multi-line text** (limit resolved, data Eva 12 URL tidak terpotong).
- ✅ Field `Image` → diisi asset yang sudah di-upload.

### Library yang dibutuhkan (di Custom Code, lihat Step 7)
| Library | Fungsi | CDN |
|---------|--------|-----|
| **GSAP** | Semua animasi (coverflow, filter, flip, dialog) | `https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js` |

> 🎉 **Tanpa Tailwind!** Semua styling pakai plain CSS (`styles.css`). Tidak perlu utility class `w-[22vw]` dll. — styling ada di class semantik di `styles.css`.

---

## 2. Bangun Struktur Page

Buat 1 page baru (atau edit existing) → hapus semua element default.

Atur **body** / section utama (div terluar) dengan class:
```
page-shell
```
> Styling lengkap ada di `styles.css` (`.page-shell` = fixed full-screen, flex column, no-select, overflow hidden). Tidak perlu inline class Tailwind.

> ℹ️ **Load `styles.css`** dulu di Page Settings → Custom Code → "Inside `<head>` tag":
> ```html
> <link rel="stylesheet" href="https://uploads-ssl.webflow.com/XXXX/styles.css">
> ```
> (upload `webflow/styles.css` ke Webflow Assets dulu → copy URL). Atau paste seluruh isi `styles.css` di dalam `<style>...</style>` di section yang sama. Detail di Step 7.

---

## 3. Hidden Collection List (Data Source)

**Tujuan**: emit data ke `window.tutorialsData[]` yang dibaca `embed.js`.

1. Tambah **Collection List** widget → bind ke collection `list-video-tutorials`.
2. Beri class `cms-data-source` di wrapper Collection List-nya (biar hidden).
3. Di dalam **Collection Item**, tambah **HTML Embed** widget, paste kode ini:

```html
<script>
window.tutorialsData = window.tutorialsData || [];
// Webflow field bindings can leak literal bracket chars ([value]); strip them.
const clean = (s) => (s || "").toString().replace(/^\[+|\]+$/g, "").trim();
const cleanList = (s, opts) => {
  let v = clean(s);
  if (opts && opts.lower) v = v.toLowerCase();
  return v.split(/[,;]/).map(x => x.trim()).map(opts && opts.normalize || (x => x)).filter(Boolean);
};
window.tutorialsData.push({
  title: clean(`[T Name]`),
  category: clean(`[T Category]`),
  materials: cleanList(`[T Materials]`, { lower: true, normalize: m => m.replace(/s$/, "") }),
  scales: cleanList(`[T Scales]`),
  img: clean(`[T Image]`),
  videos: {
    en: cleanList(`[T Videos EN]`),
    es: cleanList(`[T Videos ES]`)
  }
});
</script>
```

> ⚠️ **Penting soal binding field**:
> - Untuk field teks (`+ Add Field`), Webflow gunakan format `[Name]`, `[Category]`, dst.
> - Untuk **Image field**: pastikan output-nya **URL string**, bukan tag `<img>`.
>   Klik `[+ Add]` → pilih field Image → pilih **"URL"** (bukan "Image tag").

### ⚠️ Gotcha delimiter CSV (PENTING!)

Webflow CSV importer **gak handle quoted-comma dengan benar**. Kalau field multi-value
kamu mengandung koma di dalam quote (mis. `"Metal, Skin, hair"`), parser akan lihat
kolom terpisah padahal header hanya satu → **semua baris "Validation Failure"**.

**Solusi**: gunakan **semicolon `;`** sebagai delimiter internal untuk field multi-value:
- ✅ Materials: `Metal;Skin;hair` (bukan `"Metal, Skin, hair"`)
- ✅ Scales: `75mm;bust`
- ✅ Videos: `url1;url2;url3`

Embed code di bawah sudah **robust terhadap koma & semicolon** (`split(/[,;]/)`),
jadi apapun delimiter yang akhirnya masuk ke CMS, parser tetap jalan.

### Verifikasi
Publish (atau buka preview) → buka **DevTools → Console**, ketik:
```js
window.tutorialsData
```
Harus muncul array berisi **24 object**. Cek item ke-5 ("Eva") → `videos.en` harus berisi **12 URL**.

---

## 4. Background & UI Chrome

Bangun semua element di bawah ini di Designer. **Class names harus PERSIS** (case-sensitive) — selector `embed.js` bergantung padanya.

Lihat tabel lengkap di **[Section 9: Referensi Class & Posisi](#9-referensi-class--posisi)** untuk detail posisi `vw` tiap element.

Ringkasan element yang harus dibangun:
- ✅ 3 background images (layer overlay)
- ✅ Language toggle zones (`.lang-en-zone`, `.lang-es-zone`)
- ✅ Select label + 2 nav arrows
- ✅ New/Old video labels + `.switch-videos-trigger` (3D flip pair)
- ✅ Scales panel: label + 3 markers + 3 trigger zones
- ✅ Materials panel: label + 6 markers + 6 trigger zones
- ✅ Card nav trio: `.nav-prev` | `.nav-open` | `.nav-next`

> 💡 **Tips**: pakai file `template.html` sebagai blueprint visual. Buka di browser untuk lihat layout, lalu replikasi di Webflow Designer.

---

## 5. Coverflow Container

Buat div kosong untuk wadah kartu (kartu dibuat dinamis oleh JS):

```
Parent wrapper (div pembungkus):
  class: coverflow-wrapper

Coverflow container (DI SINI JS NGISI KARTU):
  class: coverflow-container
```

> Semua styling (posisi `top: 9vw`, `100vw` width, flex centering, `preserve-3d`, `touch-action: none`) **sudah ada di `.coverflow-wrapper` & `.coverflow-container` di `styles.css`**. Tidak perlu inline style apa-apa.

Jangan taruh apa-apa di dalamnya — `embed.js` akan `createElement` kartu dari `tutorialsData`.

---

## 6. Dialog Overlay

Buat div hidden (default `display: none`) dengan struktur sesuai `template.html` section 8.

Class wajib:
- `.dialog-overlay` — wrapper overlay
- `.dialog-container` — inner container (animasi scale saat open/close)
- `.dialog-main-iframe` — iframe video utama
- `.dialog-sidebar` — container thumbnail sidebar
- `.navigation-top`, `.navigation-bottom` — nav arrows
- `.dialog-close-zone` — area klik close
- `.dialog-btn-subscribe`, `.dialog-btn-buy`, `.dialog-btn-comments` — button image EN/ES

### Button image lokal EN/ES
Setiap button image kasih **data attribute**:
```html
<img class="dialog-btn-subscribe ..."
     data-en-src="URL_Button_Subscribe_English.avif"
     data-es-src="URL_Button_Subscribe_Spanish.avif" />
```
`embed.js` bakal swap `src` sesuai bahasa aktif.

---

## 7. Pasang Custom Code

**Page Settings → Custom Code → "Inside `<head>` tag"**:
```html
<!-- styles.css: semua styling (ganti Tailwind). Upload ke Assets dulu. -->
<link rel="stylesheet" href="https://uploads-ssl.webflow.com/XXXX/styles.css">
```
> Alternatif: paste seluruh isi `styles.css` di dalam `<style>...</style>` di section ini. Lebih praktis kalau mau edit CSS tanpa re-upload Assets.

**Page Settings → Custom Code → "Before `</body>` tag"**:
```html
<!-- GSAP (animasi: coverflow, filter, flip, dialog) -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>

<!-- embed.js: upload ke Webflow Assets dulu, lalu ganti URL di bawah -->
<script src="https://uploads-ssl.webflow.com/XXXX/embed.js"></script>
```

### Cara upload `styles.css` & `embed.js`
1. Webflow Designer → **Assets** panel (panel kiri) → upload kedua file (`styles.css`, `embed.js`).
2. Klik tiap file → **Copy URL**.
3. Paste URL ke `href="..."` / `src="..."` di atas.

> Alternatif: paste seluruh isi `embed.js` langsung di HTML Embed widget di section sebelum `</body>`. Tapi cara upload file lebih bersih & gampang di-update.

---

## 8. Publish & Test

### Checklist sebelum publish
- [ ] Semua class di Section 9 sudah dibuat dengan posisi vw yang benar
- [ ] Collection List punya class `cms-data-source` & berisi embed kode
- [ ] `window.tutorialsData` ke-is 24 di Console (cek di preview)
- [ ] Custom Code head + body sudah dipasang
- [ ] `embed.js` sudah di-upload & URL-nya benar

### Checklist test interaksi (pas sudah publish)
- [ ] **First load**: 8 kartu jatuh dari atas (stagger, kartu tengah terakhir)
- [ ] **Klik kartu samping**: kartu yang diklik jadi center (smooth animate)
- [ ] **Drag/swipe**: geser mouse → next/prev card (loop)
- [ ] **Keyboard**: ArrowLeft/Right → pindah kartu
- [ ] **Klik tengah kartu / nav-open**: dialog kebuka (scale-in)
- [ ] **Dialog**: main video autoplay + sidebar 3 thumbnail
- [ ] **Sidebar nav up/down**: scroll thumbnail (disabled state di ujung)
- [ ] **Klik thumbnail sidebar**: ganti main video
- [ ] **Escape / klik luar / close button**: dialog nutup
- [ ] **Materials trigger**: slide up 6 material markers (stagger)
- [ ] **Klik material (mis. "skin")**: filter kartu → cuma yang punya material itu
- [ ] **Klik material sama lagi**: reset filter
- [ ] **Klik scale**: filter kartu → material filter ke-reset (mutual exclusion)
- [ ] **Switch New/Old trigger**: 3D flip + ganti seluruh set kartu
- [ ] **Language toggle (EN/ES)**: dialog video re-parse, button image swap

---

## 9. Referensi Class & Posisi

Semua styling (posisi `vw`, z-index, dll.) **sudah ada di `styles.css`** — kamu **tidak perlu set style inline** di Webflow Designer. Cukup assign nama class sesuai tabel di bawah, dan CSS akan handle sisanya.

> 💡 Lihat `template.html` sebagai blueprint visual lengkap (hierarchical nesting + class names).

### Background & Language
| Element | Class |
|---------|-------|
| BG image 1 | `full-width` |
| BG image 2, BG language, Select label, Arrow left/right | `full-absolute` |

### New/Old Video Flip Pair
| Element | Class |
|---------|-------|
| "New videos" label | `video-label old-videos` ⚠️ (lihat catatan App.tsx 639-647 — class tertukar) |
| "Old videos" label | `video-label new-videos` |
| Switch trigger | `switch-videos-trigger` |

### Scales Panel
| Element | Class |
|---------|-------|
| Scales label | `full-absolute scales` |
| Scales trigger | `scales-trigger` |
| 54mm marker | `scale-marker scale-54mm` |
| 75mm marker | `scale-marker scale-75mm` |
| Bust marker | `scale-marker scale-bust` |
| 54mm click zone | `scale-click-zone scales-54mm` |
| 75mm click zone | `scale-click-zone scales-75mm` |
| Bust click zone | `scale-click-zone scales-bust` |

### Materials Panel
| Element | Class |
|---------|-------|
| Materials label | `full-absolute materials` |
| Materials trigger | `materials-trigger` |
| Skin marker | `material-marker skin` |
| Metal marker | `material-marker metal` |
| Fabric marker | `material-marker fabric` |
| Terrain marker | `material-marker terrain` |
| Leather marker | `material-marker leather` |
| Hair marker | `material-marker hair` |
| Skin click zone | `material-click-zone materials-skin` |
| Metal click zone | `material-click-zone materials-metal` |
| Fabric click zone | `material-click-zone materials-fabric` |
| Terrain click zone | `material-click-zone materials-terrain` |
| Leather click zone | `material-click-zone materials-leather` |
| Hair click zone | `material-click-zone materials-hair` |

### Card Nav Trio (bawah kartu)
| Element | Class |
|---------|-------|
| Wrapper | `nav-trio-wrapper` → `nav-trio-inner` → `nav-trio-bar` |
| Prev | `nav-prev` |
| Open dialog | `nav-open` |
| Next | `nav-next` |

### Coverflow Container
| Element | Class |
|---------|-------|
| Wrapper | `coverflow-wrapper` |
| Container (kosong, JS ngisi kartu) | `coverflow-container` |

### Dialog Overlay (hidden by default via CSS)
| Element | Class |
|---------|-------|
| Overlay | `dialog-overlay` |
| Container | `dialog-container` |
| Dialog body (bg + media) | `dialog-body` |
| BG image | `dialog-bg-img` |
| Arrow icons | `dialog-arrow` |
| Nav up zone | `navigation-top` |
| Nav down zone | `navigation-bottom` |
| Media area | `dialog-media` → `dialog-media-row` |
| Main iframe | `dialog-main-iframe` |
| Sidebar | `dialog-sidebar` |
| Close img | `dialog-close-img` |
| Close zone | `dialog-close-zone` |
| Subscribe btn | `dialog-btn dialog-btn-subscribe` (+ `data-en-src`/`data-es-src`) |
| Buy btn | `dialog-btn dialog-btn-buy` (sama) |
| Comments btn | `dialog-btn dialog-btn-comments` (sama) |

---

## 10. Troubleshooting

### `window.tutorialsData` kosong / undefined
- Pastikan HTML Embed ada **di dalam Collection Item** (bukan di luar).
- Pastikan Collection List-nya **tidak** di-filter sampai kosong.
- Cek di Console apakah ada error syntax di embed code.

### Image field binding output `<img>` tag, bukan URL
- Saat add field `[Image]`, pastikan pilih opsi **"URL"** di picker, bukan "Image tag".

### Kartu gak muncul
- Pastikan `.coverflow-container` ada & kosong.
- Cek Console error: apakah GSAP loaded? `typeof window.gsap`.
- Cek apakah `tutorials.length > 0` di log.

### Filter / switch gak jalan
- Pastikan class trigger zone (`materials-trigger`, `scales-trigger`, `switch-videos-trigger`) persis.
- Cek class marker (`skin`, `metal`, `bust`, `75mm`, `54mm`) — case-sensitive.

### Dialog gak kebuka
- Pastikan `.dialog-overlay` punya `style="display:none;"` default, dan semua class wajib ada (`.dialog-container`, `.dialog-main-iframe`, `.dialog-sidebar`).

### Video gak autoplay
- Vimeo butuh `autoplay=1` query param (sudah otomatis di-handle `withAutoplay()` di `embed.js`).
- Beberapa browser block autoplay dengan sound. Vimeo handle ini otomatis (mute).

### GSF / flip gak smooth
- Pastikan `.new-videos` + `.old-videos` di posisi yang sama (`right-[9vw]`) supaya flip terlihat benar.

---

**Selesai!** Kalau ada step yang nanggung atau error, cek `template.html` sebagai blueprint visual — itu render persis sama dengan app React kalau semua class & posisi benar.
