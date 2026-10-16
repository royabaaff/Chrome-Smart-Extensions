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

  function syncCodeTools() {
    if (root.hasAttribute('data-rtl-active')) {
      markCodeTools(root);
      if (!contentObserver) {
        contentObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach(markCodeTools);
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
  }

  new MutationObserver(syncCodeTools)
    .observe(root, { attributes: true, attributeFilter: ['data-rtl-active'] });
  syncCodeTools();
}
