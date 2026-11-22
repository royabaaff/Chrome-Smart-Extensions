// Smart RTL Fixer — content script.
//
// v2.3: in addition to keeping code-tool buttons LTR, every code block
// (pre) without its own button gets a small "Copy" button, so code can be
// copied from its box. The buttons are removed again when RTL is turned off.
if (!window.__smartRtlFixerContentInitialized) {
  window.__smartRtlFixerContentInitialized = true;

  const root = document.documentElement;
  const toolSelector = 'pre button, pre [role="button"], [class*="code"] button, [class*="code"] [role="button"]';
  let contentObserver;

  function markCodeTools(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(toolSelector)) node.setAttribute('data-smart-rtl-code-tool', '');
    node.querySelectorAll(toolSelector).forEach((tool) => {
      tool.setAttribute('data-smart-rtl-code-tool', '');
    });
  }

  function addCopyButton(pre) {
    if (!(pre instanceof Element)) return;
    // The site already provides a button (its own copy button, etc.).
    if (pre.querySelector('button')) return;
    if (pre.querySelector('[data-smart-rtl-copy-btn]')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'smart-rtl-copy-btn';
    btn.setAttribute('data-smart-rtl-copy-btn', '');
    btn.textContent = 'کپی';
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const code = pre.querySelector('code');
      const text = (code ? code.innerText : pre.innerText) || '';
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'کپی شد!';
      } catch {
        // Clipboard blocked: select the code so the user can copy it.
        const range = document.createRange();
        range.selectNodeContents(code || pre);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        btn.textContent = 'انتخاب شد';
      }
      setTimeout(() => { btn.textContent = 'کپی'; }, 1500);
    });
    pre.appendChild(btn);
  }

  function removeCopyButtons() {
    root.querySelectorAll('[data-smart-rtl-copy-btn]').forEach((btn) => btn.remove());
  }

  function scanNode(node) {
    markCodeTools(node);
    if (!(node instanceof Element)) return;
    if (node.matches('pre')) addCopyButton(node);
    node.querySelectorAll('pre').forEach(addCopyButton);
  }

  function syncCodeTools() {
    if (root.hasAttribute('data-rtl-active')) {
      markCodeTools(root);
      root.querySelectorAll('pre').forEach(addCopyButton);
      if (!contentObserver) {
        contentObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach(scanNode);
          });
        });
        contentObserver.observe(root, { childList: true, subtree: true });
      }
      return;
    }

    if (contentObserver) {
      contentObserver.disconnect();
      contentObserver = undefined;
    }
    root.querySelectorAll('[data-smart-rtl-code-tool]')
      .forEach((tool) => tool.removeAttribute('data-smart-rtl-code-tool'));
    removeCopyButtons();
  }

  new MutationObserver(syncCodeTools)
    .observe(root, { attributes: true, attributeFilter: ['data-rtl-active'] });
  syncCodeTools();
}
