(() => {
  if (window.__smartStyleFontLoaded) return;

  let isActive = false;
  let isPinned = false;
  let hoveredEl = null;
  let shadowRoot = null;
  let container = null;
  let paletteCache = null;
  let paletteScanId = 0;
  let paletteScanPromise = null;
  let pendingMousePosition = null;
  let mouseMoveFrame = 0;

  const canvas = document.createElement('canvas');
  const canvasCtx = canvas.getContext('2d', { willReadFrequently: true });

  function parseColorToRgba(colorStr) {
    if (!colorStr || !canvasCtx) return { r: 0, g: 0, b: 0, a: 0 };

    canvasCtx.clearRect(0, 0, 1, 1);
    canvasCtx.fillStyle = '#000000';
    canvasCtx.fillStyle = colorStr;
    canvasCtx.fillRect(0, 0, 1, 1);

    const [r, g, b, a] = canvasCtx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  }

  function rgbaToHex(r, g, b, a = 1) {
    const hex = [r, g, b]
      .map(value => Math.round(value).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    if (a < 1) {
      const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
      return `#${hex}${alphaHex}`;
    }

    return `#${hex}`;
  }

  function compositeColor(foreground, background) {
    const alpha = foreground.a + background.a * (1 - foreground.a);
    if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };

    return {
      r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
      g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
      b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
      a: alpha
    };
  }

  // Build the element's ancestor background/opacity stack once, then
  // derive both the visible background color and the visible text color
  // from it. Previously each of the two colors walked the whole ancestor
  // chain (and called getComputedStyle on every ancestor) separately.
  function getElementColors(el) {
    const layers = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const style = window.getComputedStyle(current);
      layers.unshift({
        color: parseColorToRgba(style.backgroundColor),
        opacity: Number.parseFloat(style.opacity)
      });
      current = current.parentElement;
    }

    const white = { r: 255, g: 255, b: 255, a: 1 };
    function renderLayer(index, backdrop, foreground) {
      if (index >= layers.length) return backdrop;

      const layer = layers[index];
      const layerBackground = compositeColor(layer.color, backdrop);
      const renderedContent = index + 1 < layers.length
        ? renderLayer(index + 1, layerBackground, foreground)
        : foreground
          ? compositeColor(foreground, layerBackground)
          : layerBackground;
      const opacity = Number.isFinite(layer.opacity) ? layer.opacity : 1;
      return compositeColor({ ...renderedContent, a: opacity }, backdrop);
    }

    const bg = renderLayer(0, white, null);
    const textColor = parseColorToRgba(window.getComputedStyle(el).color);
    const text = renderLayer(0, white, textColor);
    return {
      bg: rgbaToHex(bg.r, bg.g, bg.b),
      text: rgbaToHex(text.r, text.g, text.b)
    };
  }

  function cleanFontFamily(fontStr) {
    return fontStr ? fontStr.split(',')[0].replace(/['"]/g, '').trim() : 'Default';
  }

  function hasOwnText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) return true;
    }
    return false;
  }

  function scanPagePalettes(scanId) {
    const colorCounts = new Map();
    const fontCounts = new Map();
    const elements = document.querySelectorAll('html, body, body *');

    return new Promise(resolve => {
      let index = 0;

      function scanChunk() {
        if (scanId !== paletteScanId || !isActive) {
          resolve(null);
          return;
        }

        const chunkEnd = Math.min(index + 120, elements.length);
        for (; index < chunkEnd; index += 1) {
          const el = elements[index];
          if (container && (el === container || container.contains(el))) continue;
          if (!el.getClientRects().length) continue;

          const style = window.getComputedStyle(el);

          // Text colors count ONLY for elements that actually render text.
          // Counting every element's inherited color made parent colors
          // (e.g. body's) dominate the palette even when they never render
          // as visible text.
          if (hasOwnText(el)) {
            colorCounts.set(style.color, (colorCounts.get(style.color) || 0) + 1);
          }

          if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
            colorCounts.set(style.backgroundColor, (colorCounts.get(style.backgroundColor) || 0) + 1);
          }

          if (hasOwnText(el)) {
            const combo = `${cleanFontFamily(style.fontFamily)} | ${style.fontSize} | ${style.fontWeight}`;
            fontCounts.set(combo, (fontCounts.get(combo) || 0) + 1);
          }
        }

        if (index < elements.length) {
          window.requestAnimationFrame(scanChunk);
          return;
        }

        const normalizedColors = new Map();
        for (const [cssColor, count] of colorCounts) {
          const { r, g, b, a } = parseColorToRgba(cssColor);
          if (a === 0) continue;
          const hex = rgbaToHex(r, g, b, a);
          normalizedColors.set(hex, (normalizedColors.get(hex) || 0) + count);
        }

        resolve({
          colors: [...normalizedColors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16),
          fonts: [...fontCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        });
      }

      window.requestAnimationFrame(scanChunk);
    });
  }

  function setupUI() {
    if (container) return;

    container = document.createElement('div');
    container.id = 'style-spy-root';
    container.style.cssText = 'all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; display: block !important;';
    document.documentElement.appendChild(container);
    shadowRoot = container.attachShadow({ mode: 'open' });

    shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; font-size: 12px; }
        .inspector-panel {
          position: fixed; bottom: 24px; right: 24px; width: min(360px, calc(100vw - 32px));
          max-height: min(80vh, 720px); overflow-y: auto; background: #111827; color: #f3f4f6;
          border-radius: 12px; box-shadow: 0 10px 25px rgba(0, 0, 0, .4); padding: 16px;
          z-index: 2147483647; border: 1px solid #374151; direction: ltr; pointer-events: auto;
        }
        .header { display: flex; justify-content: space-between; align-items: center; gap: 8px;
          margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #374151;
          cursor: grab; touch-action: none; user-select: none; }
        .header:active { cursor: grabbing; }
        .header h3 { margin: 0; font-size: 14px; font-weight: 600; color: #60a5fa; }
        .actions, .tabs { display: flex; gap: 5px; }
        button { border: 1px solid #4b5563; color: #d1d5db; background: #1f2937; padding: 5px 8px;
          border-radius: 5px; cursor: pointer; }
        button:hover { background: #374151; }
        button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
        .btn-tab.active, .action.active { background: #2563eb; border-color: #3b82f6; color: white; }
        .section-title { color: #9ca3af; font-weight: 600; margin: 12px 0 6px; }
        .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 7px; align-items: center; }
        .label { color: #9ca3af; flex: 0 0 92px; }
        .val { font-family: monospace; background: #1f2937; padding: 3px 6px; border-radius: 4px;
          cursor: pointer; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .val:hover { background: #374151; color: #60a5fa; }
        .color-preview { display: inline-block; width: 14px; height: 14px; border-radius: 3px;
          margin-right: 6px; border: 1px solid rgba(255,255,255,.55); vertical-align: middle; }
        .palette-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
        .palette-item { min-width: 0; height: 42px; display: flex; align-items: flex-end; justify-content: center;
          padding: 3px; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; cursor: pointer;
          color: white; font: 10px monospace; text-shadow: 0 1px 3px #000; overflow: hidden; }
        .font-item { width: 100%; text-align: left; color: #f3f4f6; border: 0; background: #1f2937;
          padding: 8px; border-radius: 6px; margin-bottom: 6px; overflow-wrap: anywhere; }
        .font-count { color: #9ca3af; font-size: 10px; margin-top: 3px; }
        .toast { display: none; background: #047857; color: white; padding: 6px 8px;
          border-radius: 4px; text-align: center; font-size: 11px; margin-top: 8px; }
        .highlight { position: fixed; pointer-events: none; border: 2px dashed #6366f1;
          background: rgba(99, 102, 241, .08); z-index: 2147483646; display: none; }
        .hint { color: #9ca3af; font-size: 10px; margin-top: 8px; }
        @media (max-width: 420px) { .inspector-panel { right: 8px; bottom: 8px; } .label { flex-basis: 82px; } }
      </style>
      <div class="highlight" id="highlight"></div>
      <section class="inspector-panel" id="panel" aria-label="Style inspector">
        <div class="header">
          <h3>Style Inspector</h3>
          <div class="actions">
            <button type="button" class="action" id="pinButton" title="Pin the currently hovered element">Pin</button>
            <button type="button" id="copyCss" title="Copy key styles as CSS">Copy CSS</button>
            <button type="button" id="closeButton" title="Close inspector">Close</button>
          </div>
        </div>
        <div class="tabs">
          <button type="button" class="btn-tab active" id="tabInspect" aria-pressed="true">Inspect</button>
          <button type="button" class="btn-tab" id="tabPalette" aria-pressed="false">Page palette</button>
        </div>
        <div id="inspectView">
          <div class="section-title">Element</div>
          <div class="row"><span class="label">Selector</span><span class="val" id="valTag">-</span></div>
          <div class="row"><span class="label">Dimensions</span><span class="val" id="valDimensions">-</span></div>
          <div class="row"><span class="label">Display / position</span><span class="val" id="valDisplay">-</span></div>
          <div class="section-title">Typography</div>
          <div class="row"><span class="label">Font family</span><span class="val" id="valFont">-</span></div>
          <div class="row"><span class="label">Size / weight</span><span class="val" id="valSize">-</span></div>
          <div class="row"><span class="label">Line height</span><span class="val" id="valLineHeight">-</span></div>
          <div class="row"><span class="label">Letter spacing</span><span class="val" id="valLetterSpacing">-</span></div>
          <div class="section-title">Color & spacing</div>
          <div class="row"><span class="label">Text color</span><span class="val" id="valColor"><span class="color-preview" id="colorBox"></span><span id="colorHex">-</span></span></div>
          <div class="row"><span class="label">Background</span><span class="val" id="valBg" title="Visible solid color, composited through transparent backgrounds and opacity. Gradients and images are shown separately."><span class="color-preview" id="bgBox"></span><span id="bgHex">-</span></span></div>
          <div class="row"><span class="label">Background image</span><span class="val" id="valBgImage">-</span></div>
          <div class="row"><span class="label">Border radius</span><span class="val" id="valRadius">-</span></div>
          <div class="row"><span class="label">Margin</span><span class="val" id="valMargin">-</span></div>
          <div class="row"><span class="label">Padding</span><span class="val" id="valPadding">-</span></div>
          <div class="hint">Hover an element and Shift-click to lock it without activating it. Press Alt+Shift+P to pin or unpin; Esc closes the inspector.</div>
        </div>
        <div id="paletteView" style="display: none;">
          <div class="row"><span class="section-title">Most used colors</span><button type="button" id="refreshPalette">Refresh</button></div>
          <div class="palette-grid" id="colorsContainer"></div>
          <div class="section-title">Typography styles</div>
          <div id="fontsContainer"></div>
        </div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
      </section>
    `;

    // Drag the panel by its header (buttons inside the header are excluded).
    // Position is clamped to the viewport so the panel can never be lost
    // off-screen.
    const panelEl = shadowRoot.getElementById('panel');
    const headerEl = shadowRoot.querySelector('.header');
    let dragState = null;
    headerEl.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = panelEl.getBoundingClientRect();
      dragState = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      headerEl.setPointerCapture(event.pointerId);
    });
    headerEl.addEventListener('pointermove', event => {
      if (!dragState) return;
      const left = Math.max(0, Math.min(event.clientX - dragState.dx, window.innerWidth - 80));
      const top = Math.max(0, Math.min(event.clientY - dragState.dy, window.innerHeight - 60));
      panelEl.style.left = `${left}px`;
      panelEl.style.top = `${top}px`;
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
    });
    headerEl.addEventListener('pointerup', () => { dragState = null; });
    headerEl.addEventListener('pointercancel', () => { dragState = null; });

    shadowRoot.getElementById('tabInspect').addEventListener('click', () => setActiveTab('inspect'));
    shadowRoot.getElementById('tabPalette').addEventListener('click', () => setActiveTab('palette'));
    shadowRoot.getElementById('pinButton').addEventListener('click', togglePin);
    shadowRoot.getElementById('closeButton').addEventListener('click', stopInspector);
    shadowRoot.getElementById('copyCss').addEventListener('click', () => {
      if (hoveredEl) copyText(getCssSnippet(hoveredEl));
    });
    shadowRoot.getElementById('refreshPalette').addEventListener('click', () => {
      paletteCache = null;
      paletteScanId += 1;
      paletteScanPromise = null;
      renderPalettes();
    });
    shadowRoot.addEventListener('click', event => {
      const copyTarget = event.target.closest('.val, [data-copy]');
      if (!copyTarget) return;
      const text = copyTarget.dataset.copy || copyTarget.innerText;
      copyText(text.trim());
    });
  }

  function setActiveTab(tab) {
    const inspecting = tab === 'inspect';
    shadowRoot.getElementById('tabInspect').classList.toggle('active', inspecting);
    shadowRoot.getElementById('tabPalette').classList.toggle('active', !inspecting);
    shadowRoot.getElementById('tabInspect').setAttribute('aria-pressed', String(inspecting));
    shadowRoot.getElementById('tabPalette').setAttribute('aria-pressed', String(!inspecting));
    shadowRoot.getElementById('inspectView').style.display = inspecting ? 'block' : 'none';
    shadowRoot.getElementById('paletteView').style.display = inspecting ? 'none' : 'block';
    if (!inspecting) renderPalettes();
  }

  async function copyText(text) {
    if (!text || text === '-') return;

    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
      shadowRoot.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      showToast(copied ? 'Copied to clipboard' : 'Could not copy to clipboard');
      if (!copied) console.warn('Style Inspector could not copy the selected text.', error);
    }
  }

  function showToast(message, duration = 1600) {
    const toast = shadowRoot.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => { toast.style.display = 'none'; }, duration);
  }

  async function renderPalettes() {
    const colorsContainer = shadowRoot.getElementById('colorsContainer');
    const fontsContainer = shadowRoot.getElementById('fontsContainer');
    colorsContainer.replaceChildren();
    fontsContainer.replaceChildren();

    if (!paletteCache) {
      if (!paletteScanPromise) {
        const scanId = ++paletteScanId;
        colorsContainer.textContent = 'Scanning page colors...';
        fontsContainer.textContent = 'Scanning typography...';
        paletteScanPromise = scanPagePalettes(scanId).then(result => {
          if (result && scanId === paletteScanId && isActive) paletteCache = result;
          return result;
        }).finally(() => {
          if (scanId === paletteScanId) paletteScanPromise = null;
        });
      }

      try {
        await paletteScanPromise;
      } catch (error) {
        console.error('Style Inspector could not scan this page.', error);
        colorsContainer.textContent = 'Could not scan page colors.';
        fontsContainer.textContent = 'Could not scan typography.';
        return;
      }

      if (!isActive || !paletteCache) return;
    }

    if (!paletteCache.colors.length) {
      colorsContainer.textContent = 'No visible colors found.';
    }
    for (const [hex, count] of paletteCache.colors) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'palette-item';
      swatch.style.backgroundColor = hex;
      swatch.textContent = hex;
      swatch.title = `${hex} (${count} elements)`;
      swatch.dataset.copy = hex;
      colorsContainer.appendChild(swatch);
    }

    if (!paletteCache.fonts.length) {
      fontsContainer.textContent = 'No visible typography styles found.';
    }
    for (const [combo, count] of paletteCache.fonts) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'font-item';
      item.tabIndex = 0;
      item.dataset.copy = combo;
      const style = document.createElement('div');
      style.textContent = combo;
      const uses = document.createElement('div');
      uses.className = 'font-count';
      uses.textContent = `${count} elements`;
      item.append(style, uses);
      fontsContainer.appendChild(item);
    }
  }

  function getSelector(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${el.id}`;
    const classes = Array.from(el.classList).slice(0, 3);
    return classes.length ? `${tag}.${classes.join('.')}` : tag;
  }

  function getCssSnippet(el) {
    const style = window.getComputedStyle(el);
    return [
      `font-family: ${style.fontFamily};`,
      `font-size: ${style.fontSize};`,
      `font-weight: ${style.fontWeight};`,
      `line-height: ${style.lineHeight};`,
      `letter-spacing: ${style.letterSpacing};`,
      `color: ${style.color};`,
      `background-color: ${style.backgroundColor};`,
      `background-image: ${style.backgroundImage};`,
      `border-radius: ${style.borderRadius};`,
      `display: ${style.display};`,
      `margin: ${style.margin};`,
      `padding: ${style.padding};`
    ].join('\n');
  }

  function updateInspectorView(el) {
    if (!shadowRoot || !el) return;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const { text: textColor, bg: bgColor } = getElementColors(el);
    const values = {
      valTag: getSelector(el),
      valDimensions: `${Math.round(rect.width)} × ${Math.round(rect.height)} px`,
      valDisplay: `${style.display} / ${style.position}`,
      valFont: style.fontFamily,
      valSize: `${style.fontSize} / ${style.fontWeight}`,
      valLineHeight: style.lineHeight,
      valLetterSpacing: style.letterSpacing,
      valBgImage: style.backgroundImage,
      valRadius: style.borderRadius,
      valMargin: style.margin,
      valPadding: style.padding
    };

    for (const [id, value] of Object.entries(values)) {
      shadowRoot.getElementById(id).textContent = value;
    }
    shadowRoot.getElementById('colorBox').style.backgroundColor = textColor;
    shadowRoot.getElementById('colorHex').textContent = textColor;
    shadowRoot.getElementById('bgBox').style.backgroundColor = bgColor;
    shadowRoot.getElementById('bgHex').textContent = bgColor;

    const rectOverlay = shadowRoot.getElementById('highlight');
    rectOverlay.style.display = rect.width && rect.height ? 'block' : 'none';
    rectOverlay.style.left = `${rect.left}px`;
    rectOverlay.style.top = `${rect.top}px`;
    rectOverlay.style.width = `${rect.width}px`;
    rectOverlay.style.height = `${rect.height}px`;
    shadowRoot.getElementById('pinButton').textContent = isPinned ? 'Unpin' : 'Pin';
    shadowRoot.getElementById('pinButton').classList.toggle('active', isPinned);
  }

  function updatePinnedElement() {
    if (isActive && isPinned && hoveredEl) updateInspectorView(hoveredEl);
  }

  function onMouseMove(event) {
    if (!isActive || isPinned) return;
    pendingMousePosition = { x: event.clientX, y: event.clientY };
    if (mouseMoveFrame) return;

    mouseMoveFrame = window.requestAnimationFrame(() => {
      mouseMoveFrame = 0;
      if (!isActive || isPinned || !pendingMousePosition) return;
      const { x, y } = pendingMousePosition;
      pendingMousePosition = null;
      const target = document.elementFromPoint(x, y);
      if (!target || target === container || container.contains(target)) return;
      hoveredEl = target;
      updateInspectorView(hoveredEl);
    });
  }

  function onPageClick(event) {
    if (!isActive || !event.shiftKey) return;
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!target || target === container || container.contains(target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    hoveredEl = target;
    isPinned = true;
    updateInspectorView(hoveredEl);
    showToast('Selection pinned');
  }

  function togglePin() {
    isPinned = !isPinned;
    if (hoveredEl) updateInspectorView(hoveredEl);
  }

  function onKeyDown(event) {
    if (!isActive) return;
    if (event.key === 'Escape') {
      stopInspector();
      return;
    }
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      event.stopPropagation();
      togglePin();
      showToast(isPinned ? 'Selection pinned' : 'Selection unpinned');
    }
  }

  function startInspector() {
    setupUI();
    isActive = true;
    isPinned = false;
    paletteCache = null;
    container.style.setProperty('display', 'block', 'important');
    showToast('Shift + Click an element to pin it', 4500);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onPageClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', updatePinnedElement, true);
    window.addEventListener('resize', updatePinnedElement);
  }

  function stopInspector() {
    isActive = false;
    isPinned = false;
    hoveredEl = null;
    paletteScanId += 1;
    paletteScanPromise = null;
    pendingMousePosition = null;
    if (mouseMoveFrame) {
      window.cancelAnimationFrame(mouseMoveFrame);
      mouseMoveFrame = 0;
    }
    if (container) container.style.setProperty('display', 'none', 'important');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('click', onPageClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', updatePinnedElement, true);
    window.removeEventListener('resize', updatePinnedElement);
  }

  chrome.runtime.onMessage.addListener(request => {
    if (request.action !== 'toggle_inspector') return;
    if (isActive) stopInspector();
    else startInspector();
  });
  window.__smartStyleFontLoaded = true;
})();
