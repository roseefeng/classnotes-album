// 搜索索引：把 OCR 文本存到 IndexedDB，按需建立
const DB_NAME = 'cn_search_db';
const STORE = 'ocr_text';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOCRText(photoId, text) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ text, indexed_at: Date.now() }, photoId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch { return false; }
}

export async function getOCRText(photoId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(photoId);
      req.onsuccess = () => resolve(req.result?.text || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function getAllIndexed() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAllKeys();
      const dataReq = store.getAll();
      let keys = [], data = [];
      req.onsuccess = () => { keys = req.result; check(); };
      dataReq.onsuccess = () => { data = dataReq.result; check(); };
      function check() {
        if (keys.length !== undefined && data.length !== undefined && keys.length === data.length) {
          const result = {};
          keys.forEach((k, i) => { result[k] = data[i]; });
          resolve(result);
        }
      }
      tx.onerror = () => resolve({});
    });
  } catch { return {}; }
}

export async function deleteOCRText(photoId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(photoId);
      tx.oncomplete = () => resolve(true);
    });
  } catch { return false; }
}

// 简单全文搜索（包含匹配，不分词）
// 返回：[{photoId, text, score}], score 是匹配次数
export function searchInIndex(index, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const [photoId, entry] of Object.entries(index)) {
    const text = (entry.text || '').toLowerCase();
    if (!text) continue;
    let score = 0;
    let pos = 0;
    while ((pos = text.indexOf(q, pos)) !== -1) {
      score++;
      pos += q.length;
    }
    if (score > 0) {
      // 提取上下文片段
      const idx = text.indexOf(q);
      const start = Math.max(0, idx - 15);
      const end = Math.min(text.length, idx + q.length + 30);
      const snippet = (start > 0 ? '…' : '') + entry.text.slice(start, end) + (end < text.length ? '…' : '');
      results.push({ photoId, text: entry.text, score, snippet });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
