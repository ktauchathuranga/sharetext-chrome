chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "generateQRText",
    title: "Share this text as QR code",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "generateQRLink",
    title: "Share this link as QR code",
    contexts: ["link"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  let payload = null;

  if (info.menuItemId === "generateQRText" && info.selectionText) {
    payload = { type: "text", data: info.selectionText };
  } else if (info.menuItemId === "generateQRLink" && info.linkUrl) {
    payload = { type: "link", data: info.linkUrl };
  }

  if (payload) {
    // Store data in chrome.storage.local — no URL length limits
    chrome.storage.local.set({ sharetext_data: payload }, () => {
      chrome.windows.create({
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 340,
        height: 480
      });
    });
  }
});
