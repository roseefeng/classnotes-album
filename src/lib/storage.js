// 本地数据持久化
const KEYS = {
  COURSES: 'cn_courses',
  PHOTOS: 'cn_photos',
  FEEDBACK: 'cn_feedback',
  ONBOARDED: 'cn_onboarded',
  LAST_SYNC: 'cn_last_sync',
  CLASSIFIER_LOADED: 'cn_classifier_loaded',
};

const COLOR_POOL = [
  'var(--c1)', 'var(--c2)', 'var(--c3)',
  'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)',
];

const DEFAULT_COURSES = [
  { id: 'c1', name: '线性代数', day: 3, start: '14:00', end: '15:40', color: 'var(--c1)' },
  { id: 'c2', name: '机器学习', day: 4, start: '08:00', end: '09:40', color: 'var(--c2)' },
  { id: 'c3', name: '数据结构', day: 1, start: '08:00', end: '09:40', color: 'var(--c3)' },
  { id: 'c4', name: '高等数学', day: 2, start: '10:00', end: '11:40', color: 'var(--c4)' },
];

export function loadCourses() {
  const raw = localStorage.getItem(KEYS.COURSES);
  if (!raw) {
    localStorage.setItem(KEYS.COURSES, JSON.stringify(DEFAULT_COURSES));
    return DEFAULT_COURSES;
  }
  try { return JSON.parse(raw); } catch { return DEFAULT_COURSES; }
}
export function saveCourses(courses) {
  localStorage.setItem(KEYS.COURSES, JSON.stringify(courses));
}
export function nextColor(courses) {
  const used = new Set(courses.map(c => c.color));
  return COLOR_POOL.find(c => !used.has(c)) || COLOR_POOL[courses.length % COLOR_POOL.length];
}
export { COLOR_POOL };

// 照片分两部分：元数据存 localStorage，dataUrl 存 IndexedDB（避免 localStorage 满）
export function loadPhotos() {
  try { return JSON.parse(localStorage.getItem(KEYS.PHOTOS) || '[]'); }
  catch { return []; }
}
export function savePhotos(photos) {
  // 不存 dataUrl 在 localStorage，防止超限
  const slim = photos.map(({ dataUrl, ...rest }) => rest);
  try {
    localStorage.setItem(KEYS.PHOTOS, JSON.stringify(slim));
  } catch (e) {
    console.warn('photos quota exceeded, keeping only recent 200');
    localStorage.setItem(KEYS.PHOTOS, JSON.stringify(slim.slice(-200)));
  }
}

// IndexedDB 存图像数据
const DB_NAME = 'cn_photos_db';
const STORE = 'images';

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

export async function saveImage(id, dataUrl) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('saveImage failed', e);
    return false;
  }
}

export async function loadImage(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

export async function deleteImage(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve(true);
    });
  } catch (e) { return false; }
}

export function loadFeedback() {
  try { return JSON.parse(localStorage.getItem(KEYS.FEEDBACK) || '{}'); }
  catch { return {}; }
}
export function saveFeedback(f) {
  localStorage.setItem(KEYS.FEEDBACK, JSON.stringify(f));
}

export function isOnboarded() {
  return localStorage.getItem(KEYS.ONBOARDED) === '1';
}
export function setOnboarded() {
  localStorage.setItem(KEYS.ONBOARDED, '1');
}

export function getLastSync() {
  const v = localStorage.getItem(KEYS.LAST_SYNC);
  return v ? new Date(parseInt(v, 10)) : null;
}
export function setLastSync(time = Date.now()) {
  localStorage.setItem(KEYS.LAST_SYNC, String(time));
}

export function isClassifierEverLoaded() {
  return localStorage.getItem(KEYS.CLASSIFIER_LOADED) === '1';
}
export function setClassifierEverLoaded() {
  localStorage.setItem(KEYS.CLASSIFIER_LOADED, '1');
}
