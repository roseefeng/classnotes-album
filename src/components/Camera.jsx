import React, { useEffect, useRef, useState } from 'react';
import { IconClose, IconRotate, IconBolt, IconCamera } from './Icons.jsx';

export default function Camera({ matchedCourse, onCapture, onClose, onPickFile }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        setError(e.message || '相机不可用');
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [facing]);

  const snap = async () => {
    if (!videoRef.current) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    const photo = {
      id: 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      takenAt: new Date().toISOString(),
      dataUrl,
      source: 'capture',
      name: 'camera_' + Date.now() + '.jpg',
    };
    onCapture(photo);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      zIndex: 1500,
      display: 'flex', flexDirection: 'column',
      maxWidth: '450px', margin: '0 auto',
    }}>
      {/* 顶栏 */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        padding: 'max(40px, env(safe-area-inset-top)) 22px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 10,
      }}>
        <button onClick={onClose} className="tap" style={{ color: 'var(--bg)' }}>
          <IconClose size={22} />
        </button>
        {matchedCourse ? (
          <div style={{
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            padding: '6px 14px', borderRadius: '100px',
            display: 'flex', alignItems: 'center', gap: '6px',
            color: 'var(--bg)', fontSize: '11px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--c1)' }} />
            识别到「{matchedCourse.name}」
          </div>
        ) : (
          <div style={{
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            padding: '6px 14px', borderRadius: '100px',
            color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          }}>
            非课程时段
          </div>
        )}
        <div style={{ width: '22px' }} />
      </div>

      {/* 视频取景 */}
      {error ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px',
          textAlign: 'center', color: 'var(--bg)',
        }}>
          <div>
            <div style={{ fontSize: '15px', marginBottom: '8px' }}>无法访问相机</div>
            <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '20px' }}>
              {error}<br />
              {window.location.protocol === 'http:' ? '相机需要 HTTPS 才能使用' : '请在浏览器设置中允许相机权限'}
            </div>
            <button onClick={onPickFile} className="tap" style={{
              background: 'var(--bg)', color: 'var(--ink)',
              padding: '10px 20px', borderRadius: '100px',
              fontSize: '13px', fontWeight: 500,
            }}>
              改为从相册选择
            </button>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              flex: 1,
              width: '100%',
              objectFit: 'cover',
              background: '#000',
            }}
          />

          {/* 取景框四角 */}
          <div style={{
            position: 'absolute',
            top: '90px', bottom: '160px', left: '32px', right: '32px',
            pointerEvents: 'none',
          }}>
            {[
              { top: 0, left: 0, bb: 'top left' },
              { top: 0, right: 0, bb: 'top right' },
              { bottom: 0, left: 0, bb: 'bottom left' },
              { bottom: 0, right: 0, bb: 'bottom right' },
            ].map((p, i) => (
              <div key={i} style={{
                position: 'absolute',
                width: '20px', height: '20px',
                ...p,
                borderTop: p.top === 0 ? '1.5px solid rgba(255,255,255,0.5)' : 'none',
                borderBottom: p.bottom === 0 ? '1.5px solid rgba(255,255,255,0.5)' : 'none',
                borderLeft: p.left === 0 ? '1.5px solid rgba(255,255,255,0.5)' : 'none',
                borderRight: p.right === 0 ? '1.5px solid rgba(255,255,255,0.5)' : 'none',
              }} />
            ))}
          </div>

          {flash && (
            <div className="fade-in" style={{
              position: 'absolute', inset: 0,
              background: 'white',
              animation: 'fadeIn 0.1s, fadeIn 0.1s reverse 0.1s forwards',
            }} />
          )}
        </>
      )}

      {/* 底部控制 */}
      {!error && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          padding: '20px 32px max(36px, env(safe-area-inset-bottom))',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          }}>
            <button onClick={onPickFile} className="tap" style={{
              color: 'var(--bg)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            }}>
              <IconBolt size={22} />
              <span style={{ fontSize: '9px', opacity: 0.7 }}>相册</span>
            </button>

            {/* 快门 */}
            <button onClick={snap} className="tap" style={{
              width: '68px', height: '68px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              border: '2px solid var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}>
              <div style={{
                width: '56px', height: '56px',
                borderRadius: '50%',
                background: 'var(--bg)',
              }} />
            </button>

            <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')} className="tap" style={{
              color: 'var(--bg)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            }}>
              <IconRotate size={22} />
              <span style={{ fontSize: '9px', opacity: 0.7 }}>翻转</span>
            </button>
          </div>
          <div style={{
            textAlign: 'center', marginTop: '14px',
            fontSize: '10px', color: 'rgba(255,255,255,0.5)',
          }}>
            {matchedCourse ? '拍摄后将自动归类到当前课程' : '当前不在任何课程时段，仍可拍摄'}
          </div>
        </div>
      )}
    </div>
  );
}
