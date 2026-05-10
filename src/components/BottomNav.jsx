import React from 'react';
import { IconCamera } from './Icons.jsx';

export default function BottomNav({ tab, onTabChange, onCapture }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0, left: '50%',
      transform: 'translateX(-50%)',
      width: '100%', maxWidth: '450px',
      padding: '14px 22px max(24px, env(safe-area-inset-bottom))',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'rgba(240, 235, 227, 0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      zIndex: 100,
    }}>
      <button
        onClick={() => onTabChange('album')}
        className="tap"
        style={{
          fontSize: '14px',
          fontWeight: tab === 'album' ? 600 : 400,
          color: tab === 'album' ? 'var(--ink)' : 'var(--ink-mute)',
          padding: '6px 12px',
          minWidth: '60px',
        }}
      >
        相册
      </button>

      {/* 中央相机按钮 */}
      <button
        onClick={onCapture}
        className="tap"
        style={{
          width: '54px', height: '54px',
          borderRadius: '50%',
          background: 'var(--ink)',
          color: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: 'translateY(-12px)',
          boxShadow: '0 8px 20px rgba(42, 42, 42, 0.25)',
          padding: 0,
        }}
      >
        <IconCamera size={22} />
      </button>

      <button
        onClick={() => onTabChange('courses')}
        className="tap"
        style={{
          fontSize: '14px',
          fontWeight: tab === 'courses' ? 600 : 400,
          color: tab === 'courses' ? 'var(--ink)' : 'var(--ink-mute)',
          padding: '6px 12px',
          minWidth: '60px',
        }}
      >
        课程
      </button>
    </div>
  );
}
