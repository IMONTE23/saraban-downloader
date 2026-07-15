// popup.js — Saraban Downloader controller

// ── DOM refs ──────────────────────────────────────────────
const btnStart      = document.getElementById('btn-start');
const btnStop       = document.getElementById('btn-stop');
const inputRows     = document.getElementById('input-rows');
const chkAll        = document.getElementById('chk-all');
const inputDelay    = document.getElementById('input-delay');
const statusPill    = document.getElementById('status-pill');
const progressSec   = document.getElementById('progress-section');
const progressLabel = document.getElementById('progress-label');
const progressCount = document.getElementById('progress-count');
const progressFill  = document.getElementById('progress-fill');
const logList       = document.getElementById('log-list');
const logCount      = document.getElementById('log-count');

// ── State ─────────────────────────────────────────────────
let isRunning = false;
let logEntries = 0;

// ── Init ──────────────────────────────────────────────────
loadSettings();

// ── Toggle "ทั้งหมด" ──────────────────────────────────────
chkAll.addEventListener('change', () => {
  inputRows.disabled = chkAll.checked;
  saveSettings();
});

inputRows.addEventListener('change', saveSettings);
inputDelay.addEventListener('change', saveSettings);

// ── Start ─────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
  const maxRows = chkAll.checked ? 0 : (parseInt(inputRows.value) || 10);
  const delayMs = parseInt(inputDelay.value) || 1500;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Inject content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (err) {
    console.error('Script injection failed:', err);
  }

  // Reset log
  clearLog();
  addLog('info', '🚀', `เริ่มดาวน์โหลด ${maxRows === 0 ? 'ทั้งหมด' : maxRows + ' แถว'} (delay ${delayMs}ms)`);

  setRunning(true);

  chrome.tabs.sendMessage(tab.id, {
    action: 'startDownload',
    maxRows,
    delayMs
  }, (resp) => {
    if (chrome.runtime.lastError) {
      addLog('error', '❌', 'ไม่สามารถส่งคำสั่งไปยังหน้าเว็บได้ — กรุณา reload หน้าแล้วลองใหม่');
      setRunning(false);
    }
  });
});

// ── Stop ──────────────────────────────────────────────────
btnStop.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: 'stopDownload' }).catch(() => {});
  }
  addLog('warn', '⏹', 'ผู้ใช้กดหยุดการทำงาน');
  setRunning(false);
});

// ── Message listener (from background relay) ──────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'progress') {
    const pct = msg.total > 0 ? Math.round((msg.current / msg.total) * 100) : 0;
    progressLabel.textContent = msg.message || `กำลังประมวลผล...`;
    progressCount.textContent = `${msg.current}/${msg.total}`;
    progressFill.style.width  = `${pct}%`;

    if (msg.current > 0 || msg.warning) {
      const type = msg.warning ? 'warn' : 'success';
      const icon = msg.warning ? '⚠️' : '✅';
      addLog(type, icon, msg.message);
    }
  }

  if (msg.action === 'done') {
    addLog('success', '🎉', `เสร็จสิ้น! ดาวน์โหลด ${msg.processed}/${msg.total} แถว`);
    progressLabel.textContent = `เสร็จสิ้น — ดาวน์โหลด ${msg.processed} แถว`;
    progressFill.style.width  = '100%';
    setRunning(false);
  }

  if (msg.action === 'error') {
    addLog('error', '❌', msg.message);
    setRunning(false);
  }

  return true;
});

// ── Helpers ───────────────────────────────────────────────
function setRunning(active) {
  isRunning = active;
  btnStart.style.display = active ? 'none'         : 'flex';
  btnStop.style.display  = active ? 'flex'         : 'none';
  progressSec.classList.toggle('visible', active || progressFill.style.width !== '0%');

  statusPill.textContent = active ? '▶ Running' : 'Idle';
  statusPill.classList.toggle('running', active);
}

function addLog(type, icon, text) {
  // Remove empty placeholder
  const placeholder = logList.querySelector('.empty-log');
  if (placeholder) placeholder.remove();

  const li = document.createElement('li');
  li.className = `log-entry ${type}`;
  li.innerHTML = `<span class="log-icon">${icon}</span><span>${escHtml(text)}</span>`;
  logList.appendChild(li);
  logList.scrollTop = logList.scrollHeight;

  logEntries++;
  logCount.textContent = `${logEntries} รายการ`;
}

function clearLog() {
  logList.innerHTML = '';
  logEntries = 0;
  logCount.textContent = '0 รายการ';
  progressFill.style.width = '0%';
  progressCount.textContent = '0/0';
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function saveSettings() {
  chrome.storage.local.set({
    sarabanDownloaderRows:  parseInt(inputRows.value) || 10,
    sarabanDownloaderDelay: parseInt(inputDelay.value) || 1500,
    sarabanDownloaderAll:   chkAll.checked
  });
}

function loadSettings() {
  chrome.storage.local.get(['sarabanDownloaderRows', 'sarabanDownloaderDelay', 'sarabanDownloaderAll'], (data) => {
    if (data.sarabanDownloaderRows)  inputRows.value     = data.sarabanDownloaderRows;
    if (data.sarabanDownloaderDelay) inputDelay.value    = data.sarabanDownloaderDelay;
    if (data.sarabanDownloaderAll)   chkAll.checked      = data.sarabanDownloaderAll;
    inputRows.disabled = chkAll.checked;
  });
}
