import React, { useState, useEffect, useRef } from 'react';
import { IconSearch, IconClose, IconCpu } from './Icons.jsx';
import { loadOCR, ocrImage, isOCRLoaded } from '../lib/ocr.js';
import { saveOCRText, getAllIndexed, searchInIndex } from '../lib/search.js';
import { trackOCR, trackSearch, trackModelLoad } from '../lib/analytics.js';

// 搜索流程：
// 1. 用户首次点搜索 → 检查已索引数量 vs 总照片数 → 如有未索引，弹建索引提示
// 2. 用户点"建立索引" → 加载 OCR → 批量跑 OCR → 存 IndexedDB
// 3. 索引建好 → 输入框可用 → 实时搜索

export default function SearchPanel({ photos, courses, getDataUrl, onClose, onOpenPhoto }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState({});
  const [stage, setStage] = useState('checking');
  const [ocrProgress, setOcrProgress] = useState({ done: 0, total: 0 });
  const [modelProgress, setModelProgress] = useState(0);
  const [results, setResults] = useState([]);
  const cancelRef = useRef(false);
  const inputRef = useRef();

  useEffect(() => {
    cancelRef.current = false;
    init();
    return () => { cancelRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const init = async () => {
    const idx = await getAllIndexed();
    setIndex(idx);
    const indexedCount = Object.keys(idx).length;
    if (indexedCount === 0 || photos.length - indexedCount > 5) {
      setStage('need_index');
    } else {
      setStage('ready');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const buildIndex = async () => {
    setStage('loading_model');
    const t0 = Date.now();
    try {
      await loadOCR((p) => {
        setModelProgress(p.progress);
      });
      trackModelLoad({ kind: 'tesseract', durationMs: Date.now() - t0 });
    } catch (e) {
      alert('OCR 模型加载失败：' + e.message);
      setStage('ready');
      return;
    }
    if (cancelRef.current) return;

    setStage('ocr');
    const todoPhotos = photos.filter(p => !index[p.id]);
    setOcrProgress({ done: 0, total: todoPhotos.length });

    const newIndex = { ...index };
    const ocrStart = Date.now();
    for (let i = 0; i < todoPhotos.length; i++) {
      if (cancelRef.current) break;
      const p = todoPhotos[i];
      try {
        const dataUrl = p.dataUrl || await getDataUrl(p.id);
        if (dataUrl) {
          const result = await ocrImage(dataUrl);
          await saveOCRText(p.id, result.text);
          newIndex[p.id] = { text: result.text, indexed_at: Date.now() };
        }
      } catch (e) {}
      setOcrProgress({ done: i + 1, total: todoPhotos.length });
    }
    trackOCR({ count: todoPhotos.length, durationMs: Date.now() - ocrStart });
    setIndex(newIndex);
    setStage('ready');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 搜索（query 变化时）
  useEffect(() => {
    if (stage !== 'ready') return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const matched = searchInIndex(index, query);
    setResults(matched);
    if (query.length >= 2) {
      trackSearch({ query: query.slice(0, 50), hits: matched.length });
    }
  }, [query, index, stage]);

  const findPhoto = (id) => photos.find(p => p.id === id);
  const findCourse = (cid) => courses.find(c => c.id === cid);

  return (
    <div className="fade-in" style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      maxWidth: '450px', margin: '0 auto',
      zIndex: 1100,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 顶栏：搜索框 */}
      <div style={{
        padding: 'max(20px, env(safe-area-inset-top)) 22px 12px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <button onClick={onClose} className="tap" style={{ color: 'var(--ink)', padding: '4px' }}>
          <IconClose size={20} />
        </button>
        <div style={{
          flex: 1,
          background: 'var(--card)',
          borderRadius: '10px',
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <IconSearch size={16} stroke={1.6} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={stage === 'ready' ? '搜索板书内容、关键词…' : '建立索引中…'}
            disabled={stage !== 'ready'}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: '14px', color: 'var(--ink)',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="tap" style={{ color: 'var(--ink-mute)', padding: '2px' }}>
              <IconClose size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 24px' }}>
        {stage === 'checking' && (
          <Loading text="检查索引…" />
        )}

        {stage === 'need_index' && (
          <BuildIndexPrompt
            indexedCount={Object.keys(index).length}
            totalCount={photos.length}
            onBuild={buildIndex}
          />
        )}

        {stage === 'loading_model' && (
          <ModelLoading progress={modelProgress} />
        )}

        {stage === 'ocr' && (
          <OcrProgress progress={ocrProgress} />
        )}

        {stage === 'ready' && !query && (
          <ReadyHint indexedCount={Object.keys(index).length} />
        )}

        {stage === 'ready' && query && results.length === 0 && (
          <Empty text={`没有找到包含「${query}」的内容`} />
        )}

        {stage === 'ready' && results.map(r => {
          const photo = findPhoto(r.photoId);
          if (!photo) return null;
          const course = findCourse(photo.courseId);
          return (
            <button
              key={r.photoId}
              onClick={() => onOpenPhoto(r.photoId)}
              className="tap"
              style={{
                width: '100%', padding: '12px',
                background: 'var(--card)',
                borderRadius: '12px',
                marginBottom: '8px',
                display: 'flex', gap: '12px', alignItems: 'flex-start',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '48px', height: '48px',
                background: photo.dataUrl ? `url(${photo.dataUrl}) center/cover` : 'var(--bg-2)',
                borderRadius: '8px',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  {course && (
                    <span style={{
                      background: course.color,
                      padding: '1px 8px', borderRadius: '6px',
                      fontSize: '10px', fontWeight: 500,
                      color: 'rgba(0,0,0,0.75)',
                    }}>
                      {course.name}
                    </span>
                  )}
                  <span style={{ fontSize: '10px', color: 'var(--ink-mute)' }}>
                    {photo.takenAt ? new Date(photo.takenAt).toLocaleDateString('zh-CN') : '无日期'}
                  </span>
                </div>
                <div style={{
                  fontSize: '12px',
                  color: 'var(--ink-soft)',
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }} dangerouslySetInnerHTML={{ __html: highlight(r.snippet, query) }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function highlight(snippet, query) {
  if (!snippet || !query) return snippet || '';
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return snippet
    .replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]))
    .replace(new RegExp(escaped, 'gi'), m => `<mark style="background: var(--c5); padding: 0 2px; border-radius: 3px;">${m}</mark>`);
}

function Loading({ text }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: '13px' }}>
      {text}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: '13px' }}>
      {text}
    </div>
  );
}

function ReadyHint({ indexedCount }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{
        width: '48px', height: '48px',
        borderRadius: '14px', background: 'var(--c1)',
        color: 'rgba(0,0,0,0.7)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '16px',
      }}>
        <IconSearch size={22} stroke={1.5} />
      </div>
      <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500, marginBottom: '6px' }}>
        已索引 {indexedCount} 张照片
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ink-mute)', lineHeight: 1.7 }}>
        输入板书或 PPT 上的关键词<br />
        例如「贝叶斯」「反向传播」「梯度下降」
      </div>
    </div>
  );
}

function BuildIndexPrompt({ indexedCount, totalCount, onBuild }) {
  const todo = totalCount - indexedCount;
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center' }}>
      <div style={{
        width: '48px', height: '48px',
        borderRadius: '14px', background: 'var(--c1)',
        color: 'rgba(0,0,0,0.7)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '16px',
      }}>
        <IconCpu size={22} />
      </div>
      <div style={{ fontSize: '15px', color: 'var(--ink)', fontWeight: 600, marginBottom: '8px' }}>
        建立搜索索引
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ink-mute)', lineHeight: 1.7, marginBottom: '20px' }}>
        首次使用搜索功能时需要识别照片中的文字。<br />
        约 {todo} 张待识别，每张约 2-3 秒，<br />
        可以离开页面（会停止），下次回来继续。
      </div>
      <div style={{
        background: 'var(--bg-2)',
        borderRadius: '8px',
        padding: '8px 12px',
        marginBottom: '20px',
        fontSize: '11px',
        color: 'var(--ink-soft)',
      }}>
        会下载约 15MB 的中英文识别模型（仅首次）<br />
        所有处理在你的手机上完成，照片不上传
      </div>
      <button onClick={onBuild} className="tap" style={{
        background: 'var(--ink)', color: 'var(--bg)',
        padding: '12px 28px', borderRadius: '100px',
        fontSize: '14px', fontWeight: 500,
      }}>
        开始建立索引
      </button>
    </div>
  );
}

function ModelLoading({ progress }) {
  return (
    <div style={{ padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', marginBottom: '4px' }}>
          下载文字识别模型
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ink-mute)' }}>
          仅首次需要 · 约 15MB
        </div>
      </div>
      <div style={{ height: '6px', background: 'var(--bg-2)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          width: `${progress * 100}%`, height: '100%',
          background: 'var(--c1)', transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}

function OcrProgress({ progress }) {
  const pct = progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <div style={{ padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', marginBottom: '4px' }}>
          识别照片中的文字
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ink-mute)' }}>
          {progress.done} / {progress.total}
        </div>
      </div>
      <div style={{ height: '6px', background: 'var(--bg-2)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct * 100}%`, height: '100%',
          background: 'var(--c2)', transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}
