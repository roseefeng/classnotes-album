import React, { useState } from 'react';
import { COLOR_POOL } from '../lib/storage.js';
import { IconClose } from './Icons.jsx';

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export default function CourseEditor({ initial, onSave, onCancel, onDelete }) {
  const isNew = !initial?.id;
  const [form, setForm] = useState(initial || {
    name: '',
    day: 1,
    start: '08:00',
    end: '09:40',
    color: COLOR_POOL[0],
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      alert('请输入课程名');
      return;
    }
    if (form.start >= form.end) {
      alert('结束时间需晚于开始时间');
      return;
    }
    onSave(form);
  };

  return (
    <div className="slide-up" style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      maxWidth: '450px', margin: '0 auto',
      zIndex: 800,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 顶栏 */}
      <div style={{
        padding: 'max(40px, env(safe-area-inset-top)) 22px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <button onClick={onCancel} className="tap" style={{
          fontSize: '13px', color: 'var(--ink-mute)', padding: '4px 0',
        }}>
          取消
        </button>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
          {isNew ? '新建课程' : '编辑课程'}
        </div>
        <button onClick={submit} className="tap" style={{
          fontSize: '13px', fontWeight: 600, color: 'var(--ink)', padding: '4px 0',
        }}>
          保存
        </button>
      </div>

      {/* 颜色选择 */}
      <div style={{
        padding: '12px 22px 20px',
        display: 'flex', justifyContent: 'center', gap: '10px',
      }}>
        {COLOR_POOL.map((c) => (
          <button
            key={c}
            onClick={() => set('color', c)}
            className="tap"
            style={{
              width: '28px', height: '28px',
              borderRadius: '50%',
              background: c,
              border: form.color === c ? '2px solid var(--ink)' : 'none',
              padding: 0,
            }}
          />
        ))}
      </div>

      <div style={{ flex: 1, padding: '0 22px', overflowY: 'auto' }}>
        {/* 课程名 */}
        <div style={{ marginBottom: '20px' }}>
          <Label>课程名</Label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="例如：线性代数"
            style={inputStyle}
          />
        </div>

        {/* 星期 */}
        <div style={{ marginBottom: '20px' }}>
          <Label>星期</Label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[1, 2, 3, 4, 5, 6, 0].map(d => (
              <button
                key={d}
                onClick={() => set('day', d)}
                className="tap"
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: form.day === d ? 'var(--ink)' : 'var(--card)',
                  color: form.day === d ? 'var(--bg)' : 'var(--ink-soft)',
                  fontWeight: form.day === d ? 600 : 400,
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {/* 时间 */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <div style={{ flex: 1 }}>
            <Label>开始</Label>
            <input
              type="time"
              value={form.start}
              onChange={e => set('start', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Label>结束</Label>
            <input
              type="time"
              value={form.end}
              onChange={e => set('end', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* 删除按钮（仅编辑模式） */}
        {!isNew && (
          <button
            onClick={() => {
              if (confirm(`删除课程「${form.name}」？相关照片将变为「未分类」。`)) {
                onDelete(form.id);
              }
            }}
            className="tap"
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '20px',
            }}
          >
            删除此课程
          </button>
        )}
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: '10px',
      color: 'var(--ink-mute)',
      letterSpacing: '0.12em',
      marginBottom: '8px',
      fontWeight: 500,
    }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--card)',
  border: 'none',
  borderRadius: '10px',
  fontSize: '14px',
  color: 'var(--ink)',
  fontWeight: 500,
};
