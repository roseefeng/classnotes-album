// OCR 文本提取
// 使用 Tesseract.js，支持中英文混排
// 按需加载：首次调用时才下载语言包（~15-20MB），结果缓存到 IndexedDB

let workerPromise = null;
let worker = null;

export async function loadOCR(onProgress) {
  if (worker) return worker;
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    onProgress?.({ stage: 'init', progress: 0.05 });
    const Tesseract = await import('tesseract.js');
    onProgress?.({ stage: 'lib', progress: 0.15 });

    // 中英文双语
    worker = await Tesseract.createWorker(['chi_sim', 'eng'], 1, {
      logger: (m) => {
        if (m.status === 'loading language traineddata' || m.status === 'initializing api') {
          const p = 0.15 + 0.8 * (m.progress || 0);
          onProgress?.({ stage: 'load', progress: Math.min(0.95, p) });
        }
      },
    });
    onProgress?.({ stage: 'done', progress: 1 });
    return worker;
  })();
  return workerPromise;
}

export function isOCRLoaded() {
  return !!worker;
}

export async function ocrImage(input) {
  if (!worker) throw new Error('OCR not loaded; call loadOCR first');
  const { data } = await worker.recognize(input);
  return {
    text: data.text || '',
    confidence: data.confidence || 0,
  };
}

export async function ocrBatch(inputs, onProgress) {
  const results = [];
  for (let i = 0; i < inputs.length; i++) {
    try {
      const r = await ocrImage(inputs[i]);
      results.push(r);
    } catch (e) {
      results.push({ text: '', confidence: 0, error: e.message });
    }
    onProgress?.({ done: i + 1, total: inputs.length });
  }
  return results;
}

export async function unloadOCR() {
  if (worker) {
    try { await worker.terminate(); } catch (e) {}
    worker = null;
    workerPromise = null;
  }
}
