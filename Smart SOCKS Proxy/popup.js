document.addEventListener('DOMContentLoaded', () => {
  const btnConnect = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');
  const inputIp = document.getElementById('proxy-ip');
  const inputPort = document.getElementById('proxy-port');
  const inputBypass = document.getElementById('bypass-list');
  
  // لیست تمیز، هوشمند و بدون دامنه‌های .ir اضافه
  const defaultBypass = "*.ir, localhost, 127.0.0.1, aparat.com, filimo.com, digikala.com, torob.com, snapp.taxi, blubank.com, zarinpal.com, eitaa.com, bale.ai, varzesh3.com, telewebion.com, ninisite.com";
  
  chrome.storage.local.get(['savedIp', 'savedPort', 'savedBypass', 'proxyActive', 'lastGeo'], (data) => {
    if (data.savedIp) inputIp.value = data.savedIp;
    if (data.savedPort) inputPort.value = data.savedPort;
    
    let currentBypass = data.savedBypass || "";
    
    // پاکسازی خودکار لیست‌های قدیمی یا لیست حاوی سایت‌های شخصی
    if (currentBypass.trim() === "" || 
        currentBypass.replace(/\s+/g, '') === "*.ir,localhost,127.0.0.1" ||
        currentBypass.includes("elaitoys.ir")) {
      inputBypass.value = defaultBypass;
      chrome.storage.local.set({ savedBypass: defaultBypass }); 
    } else {
      inputBypass.value = currentBypass;
    }
    
    updateUI(data.proxyActive, data.lastGeo);
    
    document.getElementById('ip-address').innerText = "در حال بررسی لایو...";
    chrome.runtime.sendMessage({ action: "FORCE_CHECK_IP" });
  });

  btnConnect.addEventListener('click', () => {
    const ip = inputIp.value.trim();
    const port = inputPort.value.trim();
    const bypassStr = inputBypass.value.trim();
    
    if (ip && port) {
      const finalBypass = bypassStr === "" ? defaultBypass : bypassStr;
      chrome.storage.local.set({ savedIp: ip, savedPort: port, savedBypass: finalBypass });
      chrome.runtime.sendMessage({ action: "SET_PROXY", ip: ip, port: port, bypass: finalBypass });
      document.getElementById('ip-address').innerText = "در حال اتصال...";
    }
  });

  btnDisconnect.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "CLEAR_PROXY" });
    document.getElementById('ip-address').innerText = "در حال قطع اتصال...";
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "UPDATE_UI") updateUI(msg.proxyActive, msg.geoData);
  });

  function updateUI(isActive, geoData) {
    const statusBadge = document.getElementById('connection-status');
    statusBadge.className = isActive ? 'status-badge on' : 'status-badge off';
    statusBadge.innerText = isActive ? 'متصل' : 'غیرفعال';

    if (geoData && geoData.ip) {
      document.getElementById('ip-address').innerText = geoData.ip;
      document.getElementById('geo-location').innerText = `${geoData.flag?.emoji || ''} ${geoData.country}, ${geoData.city}`;
    }
  }
});