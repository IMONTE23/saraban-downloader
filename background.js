// background.js — relay messages and manage download file names

let nextFilename = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Save custom filename from content script before download starts
  if (msg.action === 'setNextFilename') {
    nextFilename = msg.filename;
    sendResponse({ ok: true });
    return true;
  }

  // Forward progress / done / error messages from content → popup
  if (['progress', 'done', 'error'].includes(msg.action)) {
    chrome.runtime.sendMessage(msg).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

// Intercept downloads and suggest the custom filename
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (nextFilename) {
    suggest({ filename: nextFilename, conflictAction: 'uniquify' });
    nextFilename = null; // Reset for next download
  } else {
    suggest();
  }
});

