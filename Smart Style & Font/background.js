chrome.action.onClicked.addListener(async tab => {
  if (typeof tab.id !== 'number') return;

  // The inspector only runs on real web pages. Tell the user instead of
  // silently doing nothing (chrome:// pages, the Web Store, file://, ...).
  if (!/^https?:\/\//i.test(tab.url || '')) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'logo.png',
      title: 'Smart Style & Font',
      message: 'This inspector only works on web pages (http/https).'
    });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle_inspector' });
  } catch (messageError) {
    // Content script is injected on demand only (no manifest
    // content_scripts), so the first click injects it, then toggles.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.tabs.sendMessage(tab.id, { action: 'toggle_inspector' });
    } catch (injectionError) {
      console.error('Style Inspector could not start on this page.', {
        messageError,
        injectionError
      });
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'logo.png',
        title: 'Smart Style & Font',
        message: 'Could not start the inspector on this page.'
      });
    }
  }
});
