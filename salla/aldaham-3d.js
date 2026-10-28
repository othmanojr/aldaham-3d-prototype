/*!
 * Aldaham 3D product viewer for Salla (Twilight themes)
 *
 * Adds an interactive 3D slide (Google <model-viewer>) as the first item of the
 * product gallery, with a matching "3D" thumbnail, like Cartier's product pages.
 *
 * - Runs only on product pages that have a model in PRODUCTS below.
 * - Loads model-viewer (about 1 MB) only on those pages, after the page is ready.
 * - Per-product studio lighting (HDR) and exposure, so metals and stones match the photos.
 * - View presets, reset, fullscreen, AR on phones (iOS Quick Look / Android Scene Viewer),
 *   QR code on desktop to open the page on a phone, live time on watches.
 * - Re-inserts itself if Salla re-renders the gallery (variant change etc.).
 *
 * Install: host this file next to the models/ and env/ folders on any CDN with CORS,
 * then load it from Salla's custom code (see README). Files resolve relative to this script.
 */
(function () {
  'use strict';
  if (window.__aldaham3d) return;
  window.__aldaham3d = true;

  // ---------------------------------------------------------------- configuration
  var SCRIPT = document.currentScript;
  var BASE = (SCRIPT && SCRIPT.dataset.base) || (SCRIPT ? SCRIPT.src.replace(/[^/]*$/, '') + '../' : './');
  var MODEL_VIEWER = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer.min.js';
  var QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

  // Studio "looks" per category: lighting, exposure and the view buttons.
  var LOOKS = {
    watch: {
      env: 'env/studio-watch.hdr',
      exposure: 1,
      shadow: 0.35,
      liveTime: true,
      views: [
        { id: 'front', label: 'الأمام', orbit: '0deg 90deg auto', fov: '18deg' },
        { id: 'side', label: 'الجانب', orbit: '40deg 80deg auto', fov: '18deg' },
        { id: 'back', label: 'الخلف', orbit: '180deg 90deg auto', fov: '18deg' }
      ]
    },
    jewellery: {
      env: 'env/studio-ring.hdr',
      exposure: 1,
      shadow: 0.35,
      liveTime: false,
      views: [
        { id: 'front', label: 'الأمام', orbit: '0deg 25deg auto', fov: '18deg' },
        { id: 'angle', label: 'الزاوية', orbit: '35deg 35deg auto', fov: '18deg' },
        { id: 'inside', label: 'النقش', orbit: '0deg 80deg auto', fov: '18deg' }
      ]
    }
  };

  // Optional per-product overrides, keyed by Salla product id (the number in the URL: /p21554952).
  // Products whose model is attached with Salla's own "3D images" app (three_d_image_url) work
  // without an entry here: they get the look of their category automatically.
  var PRODUCTS = window.ALDAHAM_3D_PRODUCTS || {
    '21554952': {
      look: 'watch',
      name: 'Frank Rosha SFR1838Z01',
      glb: 'models/frank-rosha-sfr1838z01.glb',
      poster: 'models/frank-rosha-sfr1838z01-poster.webp'
    },
    '1526355928': {
      look: 'jewellery',
      name: 'Frank Rosha JFRR0720Y',
      glb: 'models/frank-rosha-jfrr0720y-ring.glb',
      poster: 'models/frank-rosha-jfrr0720y-ring-poster.webp'
    }
  };

  var T = {
    badge: 'ثلاثي الأبعاد',
    hint: 'اسحب للتدوير · قرّب بإصبعين',
    hintDesktop: 'اسحب للتدوير · مرّر للتقريب',
    reset: 'إعادة الضبط',
    full: 'ملء الشاشة',
    exitFull: 'إغلاق ملء الشاشة',
    ar: 'شاهدها في مساحتك',
    qr: 'شاهدها على جوالك',
    qrTitle: 'امسح الرمز بجوالك',
    qrBody: 'لتشاهد القطعة بحجمها الحقيقي في مساحتك بتقنية الواقع المعزز.',
    close: 'إغلاق',
    live: 'الوقت الآن',
    liveOff: 'الوقت الثابت',
    loading: 'جارٍ تحميل النموذج',
    error: 'تعذّر تحميل النموذج ثلاثي الأبعاد'
  };

  // ---------------------------------------------------------------- helpers
  function productId() {
    try {
      var id = window.salla && salla.config && salla.config.get && salla.config.get('page.id');
      if (id) return String(id);
    } catch (e) { /* not Salla */ }
    var el = document.querySelector('salla-slider.details-slider[id^="details-slider-"]');
    if (el) return el.id.replace('details-slider-', '');
    var m = location.pathname.match(/\/p(\d+)(?:$|[/?#])/);
    return m ? m[1] : (document.body && document.body.dataset.productId) || null;
  }
  function url(p) { return /^(https?:)?\/\//.test(p) ? p : BASE + p; }
  function loadScript(src, module) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement('script');
      if (module) s.type = 'module';
      s.src = src; s.async = true; s.onload = function () { res(); }; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function track(action, extra) {
    var data = Object.assign({ event: 'aldaham_3d', action: action, product_id: pid }, extra || {});
    try { (window.dataLayer = window.dataLayer || []).push(data); } catch (e) { /* ignore */ }
  }
  function isTouch() { return matchMedia('(hover: none)').matches; }
  function secondsOnDial() {
    var d = new Date();
    return ((d.getHours() % 12) * 3600) + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  }
  var icon = {
    cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 7.3v9.4l-8 4.5-8-4.5V7.3l8-4.5Zm0 0v9.2m0 0 8-4.7m-8 4.7L4 7.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12c0-2.2 3.8-4 8.5-4s8.5 1.8 8.5 4-3.8 4-8.5 4c-1 0-2-.1-2.9-.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="m10.6 13.6-1.5 2.2 2.3 1.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 7.5v9l-7 4-7-4v-9l7-4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 7.5 12 11.5l7-4M12 11.5v9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  // Model attached through Salla's "3D images" app, read from the gallery data.
  function sallaModel() {
    var el = document.querySelector('salla-slider.details-slider');
    if (!el) return null;
    try {
      var imgs = JSON.parse(el.getAttribute('data-images') || '[]');
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].three_d_image_url) return { glb: imgs[i].three_d_image_url, poster: imgs[i].url, alt: imgs[i].alt };
      }
    } catch (e) { /* malformed data */ }
    return null;
  }
  function guessLook() {
    var t = ((document.querySelector('h1') || {}).textContent || '') + ' ' + ((document.querySelector('.breadcrumb, salla-breadcrumb') || {}).textContent || '');
    return /ساعة|ساعات|watch/i.test(t) ? 'watch' : 'jewellery';
  }

  var pid = productId();
  var native = sallaModel();
  var entry = (pid && PRODUCTS[pid]) || (native ? { look: guessLook(), name: native.alt || document.title, glb: native.glb, poster: native.poster } : null);
  if (!entry) return;
  var P = Object.assign({}, LOOKS[entry.look || 'jewellery'], entry);
  if (!P.views || !P.views.length) P.views = LOOKS.jewellery.views;

  // Test mode: with data-test="1" on the script tag the viewer only appears for people who
  // open a product with ?3d=1 once (remembered on that browser; ?3d=0 turns it off again).
  if (SCRIPT && SCRIPT.dataset.test === '1') {
    var flag = new URLSearchParams(location.search).get('3d');
    try {
      if (flag === '1') localStorage.setItem('a3d', '1');
      if (flag === '0') localStorage.removeItem('a3d');
      if (localStorage.getItem('a3d') !== '1') return;
    } catch (e) { if (flag !== '1') return; }
  }

  // ---------------------------------------------------------------- styles
  var css = [
    '.a3d-slide{position:relative;width:100%;height:100%;background:#fff;overflow:hidden;font-family:inherit;-webkit-user-select:none;user-select:none}',
    '.a3d-slide model-viewer{width:100%;height:100%;display:block;background:#fff;--poster-color:#fff;--progress-bar-height:0px;outline:none}',
    '.a3d-ui{position:absolute;inset:0;pointer-events:none;z-index:3}',
    '.a3d-ui>*{pointer-events:auto}',
    '.a3d-badge{position:absolute;top:14px;inset-inline-start:14px;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.92);border:1px solid #ece6d6;color:#594103;font-size:12px;font-weight:700;line-height:1}',
    '.a3d-badge svg,.a3d-btn svg,.a3d-hint svg,.a3d-live svg{width:16px;height:16px;flex:none}',
    '.a3d-tools{position:absolute;top:14px;inset-inline-end:14px;display:flex;flex-direction:column;gap:8px}',
    '.a3d-btn{appearance:none;display:grid;place-items:center;width:38px;height:38px;border-radius:999px;border:1px solid #ece6d6;background:rgba(255,255,255,.92);color:#3a3020;cursor:pointer;padding:0;transition:background .15s,border-color .15s}',
    '.a3d-btn:hover{background:#fff;border-color:#d8c082}',
    '.a3d-btn:focus-visible,.a3d-view:focus-visible,.a3d-live:focus-visible,.a3d-ar:focus-visible{outline:2px solid #b29a5c;outline-offset:2px}',
    '.a3d-bottom{position:absolute;inset-inline:0;bottom:14px;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none}',
    '.a3d-bottom>*{pointer-events:auto}',
    '.a3d-hint{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:rgba(31,26,16,.72);color:#fff;font-size:12px;transition:opacity .4s;pointer-events:none}',
    '.a3d-hint.is-hidden{opacity:0}',
    '.a3d-views{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(255,255,255,.94);border:1px solid #ece6d6}',
    '.a3d-view{appearance:none;border:0;background:transparent;color:#5b5240;font:inherit;font-size:12.5px;padding:7px 12px;border-radius:999px;cursor:pointer;white-space:nowrap}',
    '.a3d-view[aria-pressed="true"]{background:#d8c082;color:#3f2e02;font-weight:700}',
    '.a3d-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}',
    '.a3d-live{appearance:none;display:flex;align-items:center;gap:6px;border:1px solid #ece6d6;background:rgba(255,255,255,.94);color:#5b5240;font:inherit;font-size:12.5px;padding:7px 12px;border-radius:999px;cursor:pointer}',
    '.a3d-live[aria-pressed="true"]{border-color:#d8c082;color:#3f2e02}',
    '.a3d-live b{font-variant-numeric:tabular-nums;font-weight:700}',
    '.a3d-ar{appearance:none;display:flex;align-items:center;gap:6px;border:0;background:#d8c082;color:#3f2e02;font:inherit;font-size:13px;font-weight:700;padding:9px 14px;border-radius:999px;cursor:pointer}',
    '.a3d-ar[hidden]{display:none}',
    '.a3d-progress{position:absolute;inset-inline:0;top:0;height:2px;background:transparent;z-index:4}',
    '.a3d-progress i{display:block;height:100%;width:0;background:#d8c082;transition:width .2s,opacity .4s}',
    '.a3d-error{position:absolute;inset:0;display:none;place-items:center;color:#7a6a4a;font-size:13px;background:#fff;z-index:5}',
    '.a3d-slide.has-error .a3d-error{display:grid}',
    '.a3d-qr{position:absolute;inset:0;display:none;place-items:center;background:rgba(255,255,255,.86);backdrop-filter:blur(4px);z-index:6}',
    '.a3d-qr.is-open{display:grid}',
    '.a3d-qr-card{position:relative;width:min(280px,86%);padding:22px 20px 18px;background:#fff;border:1px solid #ece6d6;border-radius:14px;box-shadow:0 12px 40px rgba(60,45,10,.12);text-align:center;color:#2b2416}',
    '.a3d-qr-card h3{margin:0 0 6px;font-size:15px}',
    '.a3d-qr-card p{margin:0 0 12px;font-size:12.5px;color:#6d6250;line-height:1.7}',
    '.a3d-qr-card .a3d-btn{position:absolute;top:8px;inset-inline-end:8px;width:32px;height:32px}',
    '.a3d-qr-code{display:grid;place-items:center}',
    '.a3d-qr-code img,.a3d-qr-code svg{width:180px;height:180px;image-rendering:pixelated}',
    '.a3d-slide.is-full{position:fixed!important;inset:0;width:100vw!important;height:100vh!important;height:100dvh!important;z-index:2147483000}',
    '.a3d-thumb{position:relative;background:#fff;cursor:pointer}',
    '.a3d-thumb img{width:100%;height:100%;object-fit:contain}',
    '.a3d-thumb span{position:absolute;bottom:6px;inset-inline-start:6px;display:flex;align-items:center;gap:3px;padding:3px 6px;border-radius:999px;background:#d8c082;color:#3f2e02;font-size:10px;font-weight:700;line-height:1}',
    '.a3d-thumb span svg{width:11px;height:11px}',
    '@media (max-width:767px){.a3d-view{padding:6px 10px;font-size:12px}.a3d-tools{top:10px;inset-inline-end:10px}.a3d-badge{top:10px;inset-inline-start:10px}}',
    '@media (prefers-reduced-motion:reduce){.a3d-hint,.a3d-progress i{transition:none}}'
  ].join('\n');

  // ---------------------------------------------------------------- slide markup
  function buildSlide() {
    var slide = document.createElement('div');
    slide.className = 'swiper-slide swiper-no-swiping a3d-slide';
    slide.setAttribute('data-a3d', '1');
    var views = P.views.map(function (v, i) {
      return '<button type="button" class="a3d-view" data-view="' + v.id + '" aria-pressed="' + (i === 0) + '">' + v.label + '</button>';
    }).join('');
    slide.innerHTML =
      '<div class="a3d-progress"><i></i></div>' +
      '<model-viewer data-a3d-mv' +
      ' src="' + url(P.glb) + '"' +
      ' poster="' + url(P.poster) + '"' +
      ' environment-image="' + url(P.env) + '"' +
      ' exposure="' + P.exposure + '"' +
      ' tone-mapping="neutral"' +
      ' shadow-intensity="' + (P.shadow || 0) + '" shadow-softness="1"' +
      ' camera-controls touch-action="pan-y" disable-pan interaction-prompt="none"' +
      ' camera-orbit="' + P.views[0].orbit + '"' +
      (P.views[0].target ? ' camera-target="' + P.views[0].target + '"' : '') +
      ' field-of-view="' + P.views[0].fov + '" min-field-of-view="6deg" max-field-of-view="30deg"' +
      ' min-camera-orbit="auto 0deg auto" max-camera-orbit="auto 180deg auto"' +
      ' interpolation-decay="120"' +
      ' ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" ar-placement="floor"' +
      ' loading="eager" reveal="auto"' +
      ' alt="' + P.name + ' – عرض ثلاثي الأبعاد">' +
      '<span slot="ar-button" hidden></span>' +
      '</model-viewer>' +
      '<div class="a3d-ui">' +
      '<div class="a3d-badge">' + icon.cube + T.badge + '</div>' +
      '<div class="a3d-tools">' +
      '<button type="button" class="a3d-btn" data-act="reset" aria-label="' + T.reset + '" title="' + T.reset + '">' + icon.reset + '</button>' +
      '<button type="button" class="a3d-btn" data-act="full" aria-label="' + T.full + '" title="' + T.full + '">' + icon.full + '</button>' +
      (isTouch() ? '' : '<button type="button" class="a3d-btn" data-act="qr" aria-label="' + T.qr + '" title="' + T.qr + '">' + icon.qr + '</button>') +
      '</div>' +
      '<div class="a3d-bottom">' +
      '<div class="a3d-hint">' + icon.rotate + (isTouch() ? T.hint : T.hintDesktop) + '</div>' +
      '<div class="a3d-row">' +
      '<div class="a3d-views" role="group">' + views + '</div>' +
      (P.liveTime ? '<button type="button" class="a3d-live" aria-pressed="true" hidden>' + icon.clock + '<span>' + T.live + '</span> <b></b></button>' : '') +
      '<button type="button" class="a3d-ar" data-act="ar" hidden>' + icon.ar + T.ar + '</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="a3d-qr" role="dialog" aria-modal="true" aria-label="' + T.qrTitle + '"><div class="a3d-qr-card">' +
      '<button type="button" class="a3d-btn" data-act="qr-close" aria-label="' + T.close + '">' + icon.close + '</button>' +
      '<h3>' + T.qrTitle + '</h3><p>' + T.qrBody + '</p><div class="a3d-qr-code"></div></div></div>' +
      '<div class="a3d-error">' + T.error + '</div>';
    return slide;
  }

  function buildThumb() {
    var t = document.createElement('div');
    t.className = 'swiper-slide slide--one-fourth a3d-thumb';
    t.setAttribute('data-a3d', '1');
    t.innerHTML = '<img class="product-single__thumb-image" src="' + url(P.poster) + '" alt="' + T.badge + '"><span>' + icon.cube + '3D</span>';
    return t;
  }

  // ---------------------------------------------------------------- behaviour
  function wire(slide) {
    var mv = slide.querySelector('model-viewer');
    var bar = slide.querySelector('.a3d-progress i');
    var hint = slide.querySelector('.a3d-hint');
    var live = slide.querySelector('.a3d-live');
    var liveOn = true;
    var current = P.views[0];

    function setView(v) {
      current = v;
      mv.cameraOrbit = v.orbit;
      mv.cameraTarget = v.target || 'auto auto auto';
      mv.fieldOfView = v.fov || 'auto';
      slide.querySelectorAll('.a3d-view').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === v.id)); });
      track('view', { view: v.id });
    }
    function tick() {
      if (!live || !liveOn) return;
      var d = new Date();
      live.querySelector('b').textContent = d.toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
    }
    function syncTime() {
      if (!P.liveTime || mv.availableAnimations.indexOf('time') < 0) return;
      mv.animationName = 'time';
      if (liveOn) { mv.currentTime = secondsOnDial(); mv.timeScale = 1; mv.play(); }
      else { mv.pause(); mv.currentTime = 36600; } // catalogue pose, 10:10
    }

    mv.addEventListener('progress', function (e) {
      var p = e.detail.totalProgress;
      bar.style.width = (p * 100) + '%';
      bar.style.opacity = p >= 1 ? '0' : '1';
    });
    mv.addEventListener('load', function () {
      track('loaded');
      if (mv.canActivateAR) slide.querySelector('.a3d-ar').hidden = false;
      if (live && mv.availableAnimations.indexOf('time') >= 0) { live.hidden = false; syncTime(); tick(); setInterval(tick, 15000); }
    });
    mv.addEventListener('error', function () { slide.classList.add('has-error'); track('error'); });
    mv.addEventListener('camera-change', function (e) {
      if (e.detail.source === 'user-interaction') {
        hint.classList.add('is-hidden');
        if (!slide.__interacted) { slide.__interacted = true; track('interact'); }
      }
    });
    mv.addEventListener('ar-status', function (e) { track('ar_' + e.detail.status); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) syncTime(); });

    slide.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.view) {
        var v = P.views.filter(function (x) { return x.id === b.dataset.view; })[0];
        if (v) setView(v);
      } else if (b.dataset.act === 'reset') {
        setView(P.views[0]);
      } else if (b.dataset.act === 'full') {
        var on = !slide.classList.contains('is-full');
        slide.classList.toggle('is-full', on);
        document.documentElement.style.overflow = on ? 'hidden' : '';
        b.setAttribute('aria-label', on ? T.exitFull : T.full);
        b.title = on ? T.exitFull : T.full;
        track(on ? 'fullscreen' : 'fullscreen_exit');
      } else if (b.dataset.act === 'ar') {
        track('ar_open');
        mv.activateAR();
      } else if (b.dataset.act === 'qr') {
        openQr(slide);
      } else if (b.dataset.act === 'qr-close') {
        slide.querySelector('.a3d-qr').classList.remove('is-open');
      } else if (b.classList.contains('a3d-live')) {
        liveOn = !liveOn;
        b.setAttribute('aria-pressed', String(liveOn));
        b.querySelector('span').textContent = liveOn ? T.live : T.liveOff;
        b.querySelector('b').textContent = '';
        syncTime(); tick();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      slide.querySelector('.a3d-qr').classList.remove('is-open');
      if (slide.classList.contains('is-full')) slide.querySelector('[data-act="full"]').click();
    });
  }

  function openQr(slide) {
    var box = slide.querySelector('.a3d-qr');
    var code = box.querySelector('.a3d-qr-code');
    box.classList.add('is-open');
    track('qr');
    if (code.childNodes.length) return;
    loadScript(QR_LIB).then(function () {
      var link = location.href.split('#')[0] + '#3d';
      var qr = window.qrcode(0, 'M');
      qr.addData(link); qr.make();
      code.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }).catch(function () { code.textContent = location.href; });
  }

  // ---------------------------------------------------------------- mount into Salla's gallery
  function mount() {
    var slider = document.querySelector('salla-slider.details-slider');
    if (!slider) return false;
    var mainEl = slider.querySelector('.s-slider-container');
    var thumbsEl = slider.querySelector('.s-slider-thumbs-container');
    if (!mainEl || !mainEl.swiper) return false;
    if (mainEl.querySelector('[data-a3d]')) return true;

    var main = mainEl.swiper;
    var thumbs = thumbsEl && thumbsEl.swiper;
    var slide = buildSlide();
    // If the theme already renders Salla's native 3D slide (plain <model-viewer>, no studio
    // lighting, no AR), replace it in place and keep the theme's own thumbnail.
    var nativeMv = mainEl.querySelector('model-viewer:not([data-a3d-mv])');
    var nativeSlide = nativeMv && (nativeMv.classList.contains('swiper-slide') ? nativeMv : nativeMv.closest('.swiper-slide'));
    var idx = nativeSlide ? Array.prototype.indexOf.call(main.slides, nativeSlide) : -1;
    if (idx >= 0) {
      main.removeSlide(idx);
      main.addSlide(idx, slide);
      main.update();
      main.slideTo(idx, 0);
      if (thumbs) thumbs.slideTo(idx, 0);
    } else {
      main.prependSlide(slide);
      if (thumbs) { thumbs.prependSlide(buildThumb()); thumbs.update(); }
      main.update();
      main.slideTo(0, 0);
      if (thumbs) thumbs.slideTo(0, 0);
    }
    // Swiper clones nodes in some modes: wire the live one.
    wire(mainEl.querySelector('.a3d-slide'));
    track('mounted');
    return true;
  }

  function start() {
    var style = document.createElement('style');
    style.id = 'aldaham-3d-css';
    style.textContent = css;
    document.head.appendChild(style);
    // One copy of model-viewer only: if the theme already registered one, reuse it.
    if (!window.customElements || !customElements.get('model-viewer')) {
      loadScript(MODEL_VIEWER, true).catch(function () { /* viewer stays on poster */ });
    }

    var tries = 0;
    (function attempt() {
      if (mount()) return watch();
      if (++tries < 60) setTimeout(attempt, 250);
    })();
  }

  // Salla may re-render the gallery (e.g. variant change): put the 3D slide back.
  function watch() {
    var root = document.querySelector('.product-single__main-media') || document.body;
    new MutationObserver(function () {
      var mainEl = document.querySelector('salla-slider.details-slider .s-slider-container');
      if (mainEl && mainEl.swiper && !mainEl.querySelector('[data-a3d]')) mount();
    }).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
