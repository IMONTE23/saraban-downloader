// content.js — automation engine สำหรับ Saraban Downloader

if (!window.__sarabanDownloaderLoaded) {
  window.__sarabanDownloaderLoaded = true;

  let stopFlag = false;

  // ============================================================
  // หา Click Targets ทั้งหมดในตารางหลัก
  // ============================================================
  function findClickTargets() {
    // หา tbody ของตารางข้อมูลหลัก
    const tbody = document.querySelector('table tbody');
    if (!tbody) return [];

    // ดึง tr ทั้งหมดใน tbody
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const targets = [];

    for (const row of rows) {
      // ข้ามแถวที่ไม่มีข้อมูลจริง (เช่น แถว "No data available", "กำลังโหลดข้อมูล" หรือแถวเปล่า)
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) continue;

      // ตัวเลือกที่ 1: หา td ที่มีคลาส sorting_1 (คอลัมน์ที่กำลังเรียงลำดับ)
      // ตัวเลือกที่ 2: หา td ลำดับที่ 7 (index 6) ซึ่งปกติจะเป็นช่อง วันที่/เวลา ที่ผู้ใช้คลิกเปิด
      let clickTarget = row.querySelector('td.sorting_1');
      if (!clickTarget) {
        clickTarget = cells[6] || cells[cells.length - 1];
      }

      if (clickTarget) {
        targets.push(clickTarget);
      }
    }

    return targets;
  }

  // ============================================================
  // รอ element ปรากฏใน DOM
  // ============================================================
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) { resolve(el); return; }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found && found.offsetParent !== null) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  // ============================================================
  // รอ element หายไปจาก DOM
  // ============================================================
  function waitForElementGone(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const check = () => {
        const el = document.querySelector(selector);
        if (!el || el.offsetParent === null) { resolve(); return; }
      };

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (!el || el.offsetParent === null) {
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      check();
      setTimeout(() => { observer.disconnect(); resolve(); }, timeout);
    });
  }

  // ============================================================
  // รอหัวข้อเรื่องในหน้าจอรายละเอียดเปลี่ยนแปลง
  // ============================================================
  function waitForSubjectChange(oldText, timeout = 5000) {
    return new Promise((resolve) => {
      const check = () => {
        const el = document.querySelector('h3 > span.content-header');
        if (el && el.offsetParent !== null) {
          const newText = el.textContent.trim();
          if (newText !== oldText) {
            resolve(el);
            return true;
          }
        }
        return false;
      };

      if (check()) return;

      const observer = new MutationObserver(() => {
        if (check()) observer.disconnect();
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ============================================================
  // ปิด PDF Viewer Modal
  // ============================================================
  function closePdfModal() {
    const closeBtn = document.querySelector('#btnclosemodal') || 
                     document.querySelector('.modal.in button.close, .modal.show button.close, [data-dismiss="modal"]');
    if (closeBtn) {
      closeBtn.click();
    } else {
      // กด Escape สำรอง
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    }
  }

  // ============================================================
  // Main download automation loop
  // ============================================================
  async function runDownloadAutomation(maxRows, delayMs) {
    stopFlag = false;

    const targets = findClickTargets();

    if (targets.length === 0) {
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'ไม่พบตารางข้อมูล หรือแถวที่คลิกได้ในหน้านี้'
      }).catch(() => {});
      return;
    }

    const limit = maxRows === 0 ? targets.length : Math.min(maxRows, targets.length);
    let processed = 0;

    chrome.runtime.sendMessage({
      action: 'progress',
      current: 0,
      total: limit,
      message: `พบข้อมูล ${targets.length} แถว กำลังเริ่มกระบวนการดาวน์โหลด ${limit} แถว...`
    }).catch(() => {});

    for (let i = 0; i < limit; i++) {
      if (stopFlag) break;

      const target = targets[i];

      // บันทึกหัวข้อปัจจุบันเพื่อใช้ตรวจสอบเมื่อข้อมูลเปลี่ยน
      const subjectEl = document.querySelector('h3 > span.content-header');
      const currentSubject = subjectEl ? subjectEl.textContent.trim() : '';

      // --- 1. คลิกแถวเพื่อแสดงรายละเอียด ---
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await sleep(250);
      target.click();

      // --- 2. รอหน้ารายละเอียดอัปเดตหัวข้อใหม่ ---
      const subjectUpdated = await waitForSubjectChange(currentSubject, 5000);
      if (!subjectUpdated) {
        chrome.runtime.sendMessage({
          action: 'progress',
          current: i + 1,
          total: limit,
          message: `แถวที่ ${i + 1}: เปิดหน้ารายละเอียดไม่สำเร็จ (ข้ามไป)`,
          warning: true
        }).catch(() => {});
        continue;
      }

      const newSubjectText = subjectUpdated.textContent.trim().replace(/^เรื่อง:\s*/, '');
      await sleep(300); // รอ UI โหลดไฟล์แนบ

      // --- 3. หาไฟล์ PDF ในหน้ารายละเอียด ---
      const viewPdfBtn = await waitForElement('img.view-pdf', 3000);
      if (!viewPdfBtn) {
        chrome.runtime.sendMessage({
          action: 'progress',
          current: i + 1,
          total: limit,
          message: `แถวที่ ${i + 1}: ไม่พบไฟล์ PDF แนบ (ข้ามไป)`,
          warning: true
        }).catch(() => {});
        continue;
      }

      // --- 4. คลิกเพื่อเปิดตัวดู PDF ---
      viewPdfBtn.click();

      // --- 5. รอหน้าต่างดู PDF และปุ่มดาวน์โหลด (#btndownattm) ปรากฏ ---
      const downloadBtn = await waitForElement('#btndownattm', 5000);
      if (!downloadBtn) {
        chrome.runtime.sendMessage({
          action: 'progress',
          current: i + 1,
          total: limit,
          message: `แถวที่ ${i + 1}: ไม่พบปุ่มดาวน์โหลด PDF (ข้ามไป)`,
          warning: true
        }).catch(() => {});
        closePdfModal();
        continue;
      }

      await sleep(200);

      // --- 6. ส่งชื่อไฟล์ไปให้ background.js และคลิกดาวน์โหลด PDF ---
      const cleanName = newSubjectText.replace(/[\\/:*?"<>|]/g, '_').trim();
      const filename = `${cleanName}.pdf`;

      chrome.runtime.sendMessage({
        action: 'setNextFilename',
        filename: filename
      }).catch(() => {});

      // หน่วงเวลาเล็กน้อยเพื่อให้ background.js บันทึกชื่อได้ทัน
      await sleep(100);

      downloadBtn.click();
      processed++;

      chrome.runtime.sendMessage({
        action: 'progress',
        current: processed,
        total: limit,
        message: `ดาวน์โหลดแล้ว: "${newSubjectText.substring(0, 40)}${newSubjectText.length > 40 ? '...' : ''}"`
      }).catch(() => {});

      // รอให้การดาวน์โหลดเริ่มต้น
      await sleep(800);

      // --- 7. ปิดหน้าต่างดู PDF Modal ---
      closePdfModal();
      await waitForElementGone('#btndownattm', 3000);

      // --- 8. Delay ก่อนประมวลผลแถวถัดไป ---
      if (i < limit - 1 && !stopFlag) {
        await sleep(delayMs);
      }
    }

    chrome.runtime.sendMessage({
      action: 'done',
      processed,
      total: limit
    }).catch(() => {});
  }

  // ============================================================
  // Message listener
  // ============================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'startDownload') {
      runDownloadAutomation(msg.maxRows, msg.delayMs);
      sendResponse({ ok: true });
    }
    if (msg.action === 'stopDownload') {
      stopFlag = true;
      sendResponse({ ok: true });
    }
    return false;
  });
}
