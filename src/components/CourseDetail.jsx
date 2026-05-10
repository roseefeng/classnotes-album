import React, { useState, useMemo } from 'react';
import { IconBack, IconCheck, IconTrash, IconDownload, IconMove } from './Icons.jsx';

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

const DATE_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
];

export default function CourseDetail({ course, photos, courses, onBack, onOpenPhoto, onDelete, onMove, getThumbColor }) {
  const [filter, setFilter] = useState('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [moveDialog, setMoveDialog] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'all') return photos;
    const now = new Date();
    if (filter === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      return photos.filter(p => p.takenAt && new Date(p.takenAt) >= weekStart);
    }
    if (filter === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return photos.filter(p => p.takenAt && new Date(p.takenAt) >= monthStart);
    }
    return photos;
  }, [photos, filter]);

  // 按日期分组
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(p => {
      const date = p.takenAt ? p.takenAt.slice(0, 10) : '无日期';
      if (!groups[date]) groups[date] = [];
      groups[date].push(p);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const toggleSelect = (id) => {
    const ns = new Set(selected);
    if (ns.has(id)) ns.delete(id);
    else ns.add(id);
    setSelected(ns);
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  const doDelete = () => {
    if (selected.size === 0) return;
    if (confirm(`删除 ${selected.size} 张照片？`)) {
      selected.forEach(id => onDelete(id));
      exitSelect();
    }
  };

  const doMove = (toCourseId) => {
    selected.forEach(id => onMove(id, toCourseId));
    setMoveDialog(false);
    exitSelect();
  };

  return (
    <div className="fade-up" style={{
      paddingBottom: '110px',
    }}>
      {/* 顶栏 */}
      <div style={{
        padding: 'max(20px, env(safe-area-inset-top)) 22px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0,
        background: 'rgba(240, 235, 227, 0.92)',
        backdropFilter: 'blur(20px)',
        zIndex: 50,
      }}>
        {selectMode ? (
          <>
            <button onClick={exitSelect} className="tap" style={{ fontSize: '13px', color: 'var(--ink-mute)', padding: '4px 0' }}>
              取消
            </button>
            <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500 }}>
              已选 {selected.size} 张
            </div>
            <button onClick={selectAll} className="tap" style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500, padding: '4px 0' }}>
              {selected.size === filtered.length ? '取消全选' : '全选'}
            </button>
          </>
        ) : (
          <>
            <button onClick={onBack} className="tap" style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              color: 'var(--ink)', padding: '4px 0',
            }}>
              <IconBack size={18} />
              <span style={{ fontSize: '13px' }}>返回</span>
            </button>
            <div style={{ width: '40px' }} />
          </>
        )}
      </div>

      {/* Hero */}
      {!selectMode && (
        <div style={{ padding: '8px 22px 16px' }}>
          <div style={{
            background: course.color,
            borderRadius: '16px',
            padding: '18px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              fontSize: '11px',
              color: 'rgba(0,0,0,0.55)',
              fontWeight: 500,
            }}>
              周{DAY_NAMES[course.day]} {course.start}–{course.end}
            </div>
            <div style={{
              fontSize: '24px',
              color: 'rgba(0,0,0,0.85)',
              fontWeight: 600,
              marginTop: '4px',
              lineHeight: 1.1,
            }}>
              {course.name}
            </div>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: '4px',
              marginTop: '12px',
            }}>
              <div style={{
                fontSize: '28px',
                color: 'rgba(0,0,0,0.85)',
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}>
                {photos.length}
              </div>
              <div style={{
                fontSize: '11px',
                color: 'rgba(0,0,0,0.6)',
                fontWeight: 500,
              }}>
                张照片
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 日期筛选 + 选择按钮 */}
      {!selectMode && (
        <div style={{
          padding: '0 22px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
        }}>
          <div className="scrollbar-hide" style={{
            display: 'flex', gap: '6px',
            overflowX: 'auto', flex: 1,
          }}>
            {DATE_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="tap"
                style={{
                  flexShrink: 0,
                  padding: '6px 14px',
                  borderRadius: '100px',
                  background: filter === f.key ? 'var(--ink)' : 'var(--card)',
                  color: filter === f.key ? 'var(--bg)' : 'var(--ink-soft)',
                  fontSize: '11px',
                  fontWeight: filter === f.key ? 500 : 400,
                  whiteSpace: 'nowrap',
                  border: filter === f.key ? 'none' : '0.5px solid var(--line)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {photos.length > 0 && (
            <button
              onClick={() => setSelectMode(true)}
              className="tap"
              style={{
                fontSize: '11px', color: 'var(--ink-mute)',
                padding: '6px 4px',
              }}
            >
              选择
            </button>
          )}
        </div>
      )}

      {/* 照片网格 */}
      <div style={{ padding: '0 22px' }}>
        {grouped.length === 0 ? (
          <div style={{
            padding: '60px 20px', textAlign: 'center',
            color: 'var(--ink-mute)', fontSize: '13px',
          }}>
            还没有照片<br />
            <span style={{ fontSize: '11px', opacity: 0.7, marginTop: '6px', display: 'inline-block' }}>
              在课程时段内拍摄或导入照片就会出现在这里
            </span>
          </div>
        ) : (
          grouped.map(([date, list]) => (
            <div key={date} style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '11px',
                color: 'var(--ink-mute)',
                letterSpacing: '0.12em',
                fontWeight: 500,
                marginBottom: '8px',
              }}>
                {formatDate(date)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                {list.map(p => (
                  <PhotoThumb
                    key={p.id}
                    photo={p}
                    onClick={() => {
                      if (selectMode) toggleSelect(p.id);
                      else onOpenPhoto(p.id);
                    }}
                    onLongPress={() => {
                      if (!selectMode) {
                        setSelectMode(true);
                        setSelected(new Set([p.id]));
                      }
                    }}
                    selected={selected.has(p.id)}
                    selectMode={selectMode}
                    thumbColor={getThumbColor(p)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 选择模式底部操作 */}
      {selectMode && selected.size > 0 && (
        <div className="slide-up" style={{
          position: 'fixed',
          bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: '100%', maxWidth: '450px',
          background: 'rgba(240, 235, 227, 0.96)',
          backdropFilter: 'blur(20px)',
          padding: '16px 22px max(28px, env(safe-area-inset-bottom))',
          borderTop: '0.5px solid var(--line)',
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          zIndex: 200,
        }}>
          <button onClick={() => alert('批量下载暂不可用，请单张下载')} className="tap" style={{
            color: 'var(--ink)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          }}>
            <IconDownload size={20} />
            <span style={{ fontSize: '10px' }}>下载</span>
          </button>
          <button onClick={() => setMoveDialog(true)} className="tap" style={{
            color: 'var(--ink)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          }}>
            <IconMove size={20} />
            <span style={{ fontSize: '10px' }}>移到</span>
          </button>
          <button onClick={doDelete} className="tap" style={{
            color: 'var(--danger)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          }}>
            <IconTrash size={20} />
            <span style={{ fontSize: '10px' }}>删除</span>
          </button>
        </div>
      )}

      {/* 移到对话框 */}
      {moveDialog && (
        <div className="fade-in" onClick={() => setMoveDialog(false)} style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 300,
        }}>
          <div className="slide-up" onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: '450px',
            background: 'var(--bg)',
            borderRadius: '24px 24px 0 0',
            padding: '20px 22px max(36px, env(safe-area-inset-bottom))',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
              移到课程
            </div>
            {courses.filter(c => c.id !== course.id).map(c => (
              <button
                key={c.id}
                onClick={() => doMove(c.id)}
                className="tap"
                style={{
                  width: '100%',
                  padding: '14px 12px',
                  background: 'var(--card)',
                  borderRadius: '10px',
                  marginBottom: '8px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: '24px', height: '24px',
                  borderRadius: '7px',
                  background: c.color,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--ink-mute)', marginTop: '2px' }}>
                    周{DAY_NAMES[c.day]} {c.start}–{c.end}
                  </div>
                </div>
              </button>
            ))}
            <button onClick={() => setMoveDialog(false)} className="tap" style={{
              width: '100%', padding: '14px',
              background: 'transparent',
              fontSize: '13px', color: 'var(--ink-mute)',
              marginTop: '4px',
            }}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoThumb({ photo, onClick, onLongPress, selected, selectMode, thumbColor }) {
  const pressTimer = React.useRef(null);
  const longPressed = React.useRef(false);

  const handleStart = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress();
    }, 500);
  };
  const handleEnd = () => {
    clearTimeout(pressTimer.current);
    if (!longPressed.current) onClick();
  };
  const handleCancel = () => {
    clearTimeout(pressTimer.current);
  };

  return (
    <button
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchCancel={handleCancel}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleCancel}
      style={{
        aspectRatio: 1,
        background: photo.dataUrl ? `url(${photo.dataUrl}) center/cover` : thumbColor || '#3a3a4a',
        borderRadius: '6px',
        position: 'relative',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {selectMode && (
        <>
          {selected && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(184, 168, 200, 0.4)',
            }} />
          )}
          <div style={{
            position: 'absolute',
            top: '6px', right: '6px',
            width: '18px', height: '18px',
            borderRadius: '50%',
            background: selected ? 'var(--ink)' : 'transparent',
            border: selected ? 'none' : '1.5px solid white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--bg)',
          }}>
            {selected && <IconCheck size={10} stroke={3} />}
          </div>
        </>
      )}
    </button>
  );
}

function formatDate(dateStr) {
  if (dateStr === '无日期') return '无日期';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return '今天';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
