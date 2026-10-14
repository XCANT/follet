/* Fenetre de selection : l'ecran fige. Mode 'ocr' : on trace une zone ; mode 'color' : loupe et clic sur un pixel. */
const $ = (s) => document.querySelector(s);
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

picker.onInit(({ mode, image, hint }) => {
  document.body.classList.add(mode);
  $('#hint').textContent = hint;
  const img = $('#shot');
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    requestAnimationFrame(() => picker.ready());
    const sx = img.naturalWidth / innerWidth, sy = img.naturalHeight / innerHeight;   // pixels de l'image par pixel CSS
    const at = (e) => [Math.min(cv.width - 1, Math.floor(e.clientX * sx)), Math.min(cv.height - 1, Math.floor(e.clientY * sy))];
    const cancel = () => picker.done(null);
    addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });
    addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });

    if (mode === 'color') {
      const loupe = $('#loupe'), lctx = $('#loupe canvas').getContext('2d');
      lctx.imageSmoothingEnabled = false;
      let cur = null;
      addEventListener('mousemove', (e) => {
        const [x, y] = at(e);
        lctx.clearRect(0, 0, 11, 11);
        lctx.drawImage(cv, x - 5, y - 5, 11, 11, 0, 0, 11, 11);
        const p = ctx.getImageData(x, y, 1, 1).data;
        cur = hex(p[0], p[1], p[2]);
        $('#loupe i').style.background = cur;
        $('#loupe span').textContent = cur.toUpperCase();
        loupe.style.display = 'block';
        const L = e.clientX + 150 > innerWidth ? e.clientX - 152 : e.clientX + 20;
        const T = e.clientY + 190 > innerHeight ? e.clientY - 190 : e.clientY + 20;
        loupe.style.left = L + 'px'; loupe.style.top = T + 'px';
      });
      addEventListener('mousedown', (e) => { if (e.button === 0 && cur) picker.done({ color: cur }); });
      return;
    }

    // OCR : glisser pour tracer la zone
    const sel = $('#sel');
    let start = null;
    const box = (e) => {
      const x = Math.min(start[0], e.clientX), y = Math.min(start[1], e.clientY);
      return { x, y, w: Math.abs(e.clientX - start[0]), h: Math.abs(e.clientY - start[1]) };
    };
    addEventListener('mousedown', (e) => { if (e.button !== 0) return; start = [e.clientX, e.clientY]; document.body.classList.add('dragging'); });
    addEventListener('mousemove', (e) => {
      if (!start) return;
      const b = box(e);
      Object.assign(sel.style, { display: 'block', left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    });
    addEventListener('mouseup', (e) => {
      if (!start) return;
      const b = box(e); start = null;
      if (b.w < 4 || b.h < 4) { sel.style.display = 'none'; document.body.classList.remove('dragging'); return; }
      picker.done({ rect: { x: Math.round(b.x * sx), y: Math.round(b.y * sy), w: Math.round(b.w * sx), h: Math.round(b.h * sy) } });
    });
  };
  img.src = image;
});
