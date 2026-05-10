import React, { useState, useEffect, useRef } from 'react';
import { IconClose, IconCheck, IconTrash, IconDownload, IconChevronLeft, IconChevronRight } from './Icons.jsx';

export default function PhotoViewer({ photos, startIndex, courseName, onClose, onDelete, onFeedback, feedbackMap, getDataUrl }) {
  const [idx, setIdx] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dataUrl, setDataUrl] = useState(null);
  const [toast, setToast] = useState(null);

  const touchRef = useRef({ startX: 0, startY: 0, lastDist: 0, dragging: false });

  const photo = photos[idx];

  useEffect(() => {
    if (!photo) return;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    if (photo.dataUrl) {
      setDataUrl(photo.dataUrl);
    } else {
      getDataUrl(photo.id).then(d => setDataUrl(d));
    }
  }, [idx, photo, getDataUrl]);

  const next = () => idx < photos.length - 1 && setIdx(idx + 1);
  const prev = () => idx > 0 && setIdx(idx - 1);

  // 触摸：单指滑动 / 双指捏合
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current.lastDist = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      touchRef.current.startX = e.touches[0].clientX;
      touchRef.current.startY = e.touches[0].clientY;
      touchRef.current.dragging = true;
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (touchRef.current.lastDist > 0) {
        const ratio = d / touchRef.current.lastDist;
        setScale(s => Math.max(1, Math.min(4, s * ratio)));
      }
      touchRef.current.lastDist = d;
    } else if (e.touches.length === 1 && touchRef.current.dragging && scale > 1) {
      // 平移
      e.preventDefault();
      const dx = e.touches[0].clientX - touchRef.current.startX;
      const dy = e.touches[0].clientY - touchRef.current.startY;
      setOffset({ x: dx, y: dy });
    }
  };
  const onTouchEnd = (e) => {
    if (touchRef.current.dragging && scale === 1) {
      const dx = e.changedTouches[0].clientX - touchRef.current.startX;
      const dy = e.changedTouches[0].clientY - touchRef.current.startY;
      // 横滑切换
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
        if (dx > 0) prev(); else next();
      }
    }
    touchRef.current.dragging = false;
    touchRef.current.lastDist = 0;
  };

  const onDoubleClick = () => {
    setScale(s => s > 1 ? 1 : 2);
    setOffset({ x: 0, y: 0 });
  };

const tapFb = (type) => {
  setPopping(type);
  onFeedback(photo.id, type);
  setTimeout(() => {
    setPopping(null);
    // 反馈后弹一个 toast，2 秒后自动消失
    setToast(type === 'correct' ? '已记录：分类正确' : '已记录：分类错误');
    setTimeout(() => setToast(null), 1500);
  }, 200);
};

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${courseName}_${photo.takenAt?.slice(0, 10) || 'photo'}.jpg`;
    a.click();
  };

  const handleDelete = () => {
    if (confirm('删除这张照片？')) {
      onDelete(photo.id);
      if (idx >= photos.length - 1 && idx > 0) setIdx(idx - 1);
      else if (photos.length === 1) onClose();
    }
  };

  if (!photo) return null;

  return (
    <div className="fade-in" style={{
      position: 'fixed', inset: 0, background: '#0a0a0a',
      zIndex: 2000,
      display: 'flex', flexDirection: 'column',
      maxWidth: '450px', margin: '0 auto',
    }}>
      {/* 顶栏 */}
      <div style={{
        padding: 'max(40px, env(safe-area-inset-top)) 22px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 10,
      }}>
        <button onClick={onClose} className="tap" style={{ color: 'var(--bg)' }}>
          <IconClose size={20} />
        </button>
        <div style={{ textAlign: 'center', color: 'var(--bg)' }}>
          <div style={{ fontSize: '14px', fontWeight: 500 }}>{courseName || '相册'}</div>
          <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '2px' }}>
            {photo.takenAt
              ? new Date(photo.takenAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '无时间'}
            {' · '}{idx + 1}/{photos.length}
          </div>
        </div>
        <div style={{ width: '20px' }} />
      </div>

      {/* 主图区 */}
      <div
        style={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
      >
        {/* 左右切换箭头（PC） */}
        {idx > 0 && (
          <button onClick={prev} className="tap" style={{
            position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)',
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 5,
          }}>
            <IconChevronLeft size={18} stroke={2} />
          </button>
        )}
        {idx < photos.length - 1 && (
          <button onClick={next} className="tap" style={{
            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 5,
          }}>
            <IconChevronRight size={18} stroke={2} />
          </button>
        )}

        {scale > 1 && (
          <div style={{
            position: 'absolute', top: '12px', right: '12px',
            padding: '4px 10px',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '100px',
            fontSize: '10px', color: 'var(--bg)', fontWeight: 500,
            zIndex: 5,
          }}>
            {scale.toFixed(1)}×
          </div>
        )}

        {/* 主图 */}
        {dataUrl ? (
          <img
            src={dataUrl}
            alt=""
            draggable={false}
            style={{
              maxWidth: '100%', maxHeight: '100%',
              objectFit: 'contain',
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transition: touchRef.current.dragging ? 'none' : 'transform 0.2s',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>加载中...</div>
        )}
      </div>

      {/* 缩略图条 */}
      {photos.length > 1 && (
        <div className="scrollbar-hide" style={{
          padding: '8px 0', display: 'flex', justifyContent: 'center', gap: '4px',
          overflowX: 'auto',
        }}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setIdx(i)}
              style={{
                width: '32px', height: '32px',
                background: p.thumbColor || '#333',
                borderRadius: '4px',
                border: i === idx ? '1.5px solid var(--bg)' : '1.5px solid transparent',
                opacity: i === idx ? 1 : 0.5,
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className="fade-up" style={{
          position: 'absolute',
          bottom: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          color: 'var(--bg)',
          padding: '8px 16px',
          borderRadius: '100px',
          fontSize: '12px',
          fontWeight: 500,
          zIndex: 20,
          whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
      {/* 底部操作 */}
      <div style={{
        padding: '14px 22px max(28px, env(safe-area-inset-bottom))',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      }}>
        <button onClick={() => tapFb('correct')} className={`tap ${popping === 'correct' ? 'pop' : ''}`} style={{
  color: feedbackMap?.[photo.id] === 'correct' ? 'var(--c1)' : 'var(--bg)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
  opacity: feedbackMap?.[photo.id] && feedbackMap?.[photo.id] !== 'correct' ? 0.4 : 1,
}}>
          <IconCheck size={20} stroke={2} />
          <span style={{ fontSize: '10px' }}>分类对</span>
        </button>
        <button onClick={() => tapFb('wrong')} className={`tap ${popping === 'wrong' ? 'pop' : ''}`} style={{
  color: feedbackMap?.[photo.id] === 'wrong' ? 'var(--c3)' : 'var(--bg)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
  opacity: feedbackMap?.[photo.id] && feedbackMap?.[photo.id] !== 'wrong' ? 0.4 : 1,
}}>
          <IconClose size={20} stroke={2} />
          <span style={{ fontSize: '10px' }}>分错了</span>
        </button>
        <button onClick={handleDownload} className="tap" style={{
          color: 'var(--bg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
        }}>
          <IconDownload size={20} />
          <span style={{ fontSize: '10px' }}>下载</span>
        </button>
        <button onClick={handleDelete} className="tap" style={{
          color: '#d68888',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
        }}>
          <IconTrash size={20} />
          <span style={{ fontSize: '10px' }}>删除</span>
        </button>
      </div>
    </div>
  );
}
