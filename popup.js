/**
 * ShareText — popup.js
 *
 * Reads shared data from chrome.storage.local (set by background.js context menu),
 * or falls back to the active tab URL when opened via the toolbar icon.
 * Generates a QR code with adaptive error correction and full error handling.
 */

// QR capacity limits per error correction level (8-bit byte mode)
const QR_LIMITS = {
  H: 1273,
  Q: 1663,
  M: 2331,
  L: 2953
};

// SVG icon paths
const ICONS = {
  text: '<svg viewBox="0 0 16 16"><path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 13.5 1h-11ZM4 4h8v1.5H8.75V12h-1.5V5.5H4V4Z"/></svg>',
  link: '<svg viewBox="0 0 16 16"><path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9a2 2 0 0 1-1.654 1H4a2 2 0 1 1 0-4h2.354a4 4 0 0 1-.354.5ZM9.646 10.5H12a3 3 0 0 0 0-6H9a3 3 0 0 0-2.83 4H7a2 2 0 0 1 1.654-1H12a2 2 0 1 1 0 4H9.646a4 4 0 0 1 .354-.5Z"/></svg>',
  page: '<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM2.04 4.326c.325 1.329 2.532 2.54 3.717 1.462.432-.394.573-.888.444-1.369-.013-.046-.138-.175-.138-.175a2 2 0 0 1-.14-.262C5.58 3.167 5.588 2 7.09 2c.49 0 .98.233.98.698 0 1.12-.876 1.626-.876 2.468 0 .39.174.644.424.82.656.46 1.76.36 2.478.18.248-.062.476-.145.664-.254 1.082-.626 1.264-1.724 1.233-2.576a6 6 0 0 1 1.876 3.162c-.187.168-.32.38-.32.633 0 .422.218.692.476.88.094.068.188.122.27.164a6 6 0 0 1-3.498 4.544c.01-.084.014-.17.014-.258 0-.995-.732-1.6-1.37-2.14-.412-.35-.772-.644-.864-1.008-.094-.364.04-.768.36-1.177a5 5 0 0 0 .456-.756c.12-.27.168-.565.082-.854-.165-.553-.745-.952-1.546-.952-1.17 0-1.834.868-1.834 1.8 0 1.168.83 2.138 1.586 3.022.426.5.828.972.998 1.44A6 6 0 0 1 2.04 4.327Z"/></svg>',
  copy: '<svg viewBox="0 0 16 16"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>',
  download: '<svg viewBox="0 0 16 16"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"/><path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06Z"/></svg>',
  error: '<svg viewBox="0 0 16 16"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>'
};

const container = document.getElementById("container");

/**
 * Pick the best error correction level for the given text length.
 * Starts at H (most resilient) and downgrades only when needed.
 */
function pickErrorCorrection(textLength) {
  if (textLength <= QR_LIMITS.H) return { level: QRCode.CorrectLevel.H, name: "H", max: QR_LIMITS.H };
  if (textLength <= QR_LIMITS.Q) return { level: QRCode.CorrectLevel.Q, name: "Q", max: QR_LIMITS.Q };
  if (textLength <= QR_LIMITS.M) return { level: QRCode.CorrectLevel.M, name: "M", max: QR_LIMITS.M };
  if (textLength <= QR_LIMITS.L) return { level: QRCode.CorrectLevel.L, name: "L", max: QR_LIMITS.L };
  return null; // too long for any level
}

/**
 * Render the full QR popup UI.
 */
function renderQR(text, mode) {
  const ec = pickErrorCorrection(text.length);

  // Text is too long for even the lowest error correction
  if (!ec) {
    showError(
      "Text too long for QR code",
      `This text is ${text.length.toLocaleString()} characters. The maximum is approximately ${QR_LIMITS.L.toLocaleString()} characters. Try selecting a shorter passage.`
    );
    return;
  }

  container.innerHTML = "";

  // Badge
  const badge = document.createElement("div");
  badge.className = `badge badge-${mode}`;
  const modeLabels = { text: "Selected Text", link: "Link", page: "Page URL" };
  badge.innerHTML = `${ICONS[mode]} ${modeLabels[mode]}`;
  container.appendChild(badge);

  // QR wrapper
  const qrWrapper = document.createElement("div");
  qrWrapper.className = "qr-wrapper";
  const qrDiv = document.createElement("div");
  qrDiv.id = "qrcode";
  qrWrapper.appendChild(qrDiv);
  container.appendChild(qrWrapper);

  // Generate QR with error handling
  try {
    new QRCode(qrDiv, {
      text: text,
      width: 220,
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: ec.level
    });
  } catch (err) {
    console.error("QR generation failed:", err);
    showError(
      "QR code generation failed",
      err.message === "Too long data"
        ? `The text (${text.length.toLocaleString()} chars) exceeds QR capacity. Try selecting less text.`
        : `An unexpected error occurred: ${err.message}`
    );
    return;
  }

  // Preview text
  const preview = document.createElement("div");
  preview.className = "preview";
  preview.textContent = text;
  container.appendChild(preview);

  // Character count
  const charCount = document.createElement("div");
  charCount.className = "char-count";
  const isOverLimit = text.length > QR_LIMITS.L;
  charCount.innerHTML = `<span class="count-value ${isOverLimit ? "over-limit" : ""}">${text.length.toLocaleString()}</span> / ${ec.max.toLocaleString()} chars · EC Level ${ec.name}`;
  container.appendChild(charCount);

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn";
  copyBtn.id = "btn-copy";
  copyBtn.innerHTML = `${ICONS.copy} Copy`;
  copyBtn.addEventListener("click", () => handleCopy(text, copyBtn));

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn";
  downloadBtn.id = "btn-download";
  downloadBtn.innerHTML = `${ICONS.download} Save PNG`;
  downloadBtn.addEventListener("click", () => handleDownload(qrDiv));

  actions.appendChild(copyBtn);
  actions.appendChild(downloadBtn);
  container.appendChild(actions);
}

/**
 * Show a styled error screen.
 */
function showError(title, message) {
  container.innerHTML = `
    <div class="error-container">
      <div class="error-icon">${ICONS.error}</div>
      <div class="error-title">${escapeHtml(title)}</div>
      <div class="error-message">${escapeHtml(message)}</div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Copy the shared text/URL to clipboard.
 */
async function handleCopy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add("btn-copied");
    btn.innerHTML = `${ICONS.copy} Copied!`;
    setTimeout(() => {
      btn.classList.remove("btn-copied");
      btn.innerHTML = `${ICONS.copy} Copy`;
    }, 1500);
  } catch (err) {
    console.error("Copy failed:", err);
  }
}

/**
 * Download the QR code as a PNG image.
 */
function handleDownload(qrDiv) {
  // The QRCode library renders a canvas then converts to an img
  const img = qrDiv.querySelector("img");
  const canvas = qrDiv.querySelector("canvas");
  let dataUrl;

  if (img && img.src) {
    dataUrl = img.src;
  } else if (canvas) {
    dataUrl = canvas.toDataURL("image/png");
  }

  if (dataUrl) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "sharetext-qr.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Main entry point — determine data source and render.
 */
async function init() {
  try {
    // 1. Check chrome.storage.local for data from context menu
    const result = await chrome.storage.local.get("sharetext_data");

    if (result.sharetext_data && result.sharetext_data.data) {
      const { type, data } = result.sharetext_data;

      // Clear stored data immediately to avoid stale state
      await chrome.storage.local.remove("sharetext_data");

      if (data.trim() === "") {
        showError("Empty selection", "The selected text is empty. Try selecting some text first.");
        return;
      }

      renderQR(data, type);
      return;
    }

    // 2. Fallback: toolbar icon click → use active tab URL
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tabs.length > 0 && tabs[0].url) {
      const url = tabs[0].url;

      // Guard against chrome:// and edge:// internal pages
      if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
        showError("Cannot share this page", "QR codes can't be generated for browser internal pages.");
        return;
      }

      renderQR(url, "page");
      return;
    }

    showError("Nothing to share", "Select text, right-click a link, or click the icon on any web page.");
  } catch (err) {
    console.error("ShareText init error:", err);
    showError("Something went wrong", err.message || "An unexpected error occurred.");
  }
}

// Run
document.addEventListener("DOMContentLoaded", init);
