import React, { useState } from 'react';
import { IconUpload, IconCamera, IconPlus } from './Icons.jsx';
import { trackOnboarding } from '../lib/analytics.js';

const STEPS = [
  {
    title: '一键导入相册笔记',
    desc: '点击右上角箭头图标\n自动识别课堂笔记并按时间归类',
    illustration: 'import',
  },
  {
    title: '随时拍下新笔记',
    desc: '点击底部圆形按钮拍摄\n根据时间自动归到当前课程',
    illustration: 'capture',
  },
  {
    title: '搜索板书内容',
    desc: '识别照片中的文字\n用关键词找到对应笔记',
    illustration: 'search',
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);

  const next = () => {
    trackOnboarding({ step, action: 'next' });
    if (step < STEPS.length - 1) setStep(step + 1);
    else onDone();
  };
  const skip = () => {
    trackOnboarding({ step, action: 'skip' });
    onDone();
  };

  const cur = STEPS[step];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      maxWidth: '450px', margin: '0 auto', zIndex: 1000,
    }}>
      {/* 进度点 */}
      <div style={{
        padding: '40px 22px 0',
        display: 'flex', justifyContent: 'center', gap: '6px',
      }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? '20px' : '6px',
            height: '4px',
            borderRadius: '2px',
            background: i === step ? 'var(--ink)' : 'var(--line)',
            transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }} />
        ))}
      </div>

      {/* 主内容 */}
      <div key={step} className="fade-up" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 32px 40px',
      }}>
        {/* 演示图 */}
        <Illustration kind={cur.illustration} />

        {/* 文字 */}
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <div style={{
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
          }}>
            {cur.title}
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--ink-soft)',
            marginTop: '12px',
            lineHeight: 1.7,
            whiteSpace: 'pre-line',
          }}>
            {cur.desc}
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div style={{
        padding: '20px 22px max(28px, env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <button onClick={skip} className="tap" style={{
          fontSize: '13px',
          color: 'var(--ink-mute)',
          padding: '10px 4px',
        }}>
          跳过
        </button>
        <button onClick={next} className="tap" style={{
          background: 'var(--ink)',
          color: 'var(--bg)',
          padding: '12px 28px',
          borderRadius: '100px',
          fontSize: '13px',
          fontWeight: 500,
        }}>
          {step === STEPS.length - 1 ? '开始使用' : '下一步'}
        </button>
      </div>
    </div>
  );
}

function Illustration({ kind }) {
  // 演示用的小手机框架，高亮目标按钮位置
  return (
    <div style={{
      width: '180px', height: '240px',
      background: 'var(--bg)',
      border: '1.5px solid var(--ink)',
      borderRadius: '24px',
      padding: '14px',
      position: 'relative',
    }}>
      {kind === 'import' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 500 }}>课堂相册</div>
            <div style={{ position: 'relative' }}>
              <div style={{ color: 'var(--ink)' }}><IconUpload size={13} stroke={2} /></div>
              <div style={{
                position: 'absolute', inset: '-6px',
                border: '1.5px solid var(--c1)',
                borderRadius: '50%',
                animation: 'pulseGlow 2s infinite',
              }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            <div style={{ aspectRatio: 1, background: 'var(--c1)', borderRadius: '6px', opacity: 0.4 }} />
            <div style={{ aspectRatio: 1, background: 'var(--c2)', borderRadius: '6px', opacity: 0.4 }} />
            <div style={{ aspectRatio: 1, background: 'var(--c3)', borderRadius: '6px', opacity: 0.4 }} />
            <div style={{ aspectRatio: 1, background: 'var(--c4)', borderRadius: '6px', opacity: 0.4 }} />
          </div>
        </>
      )}
      {kind === 'capture' && (
        <>
          <div style={{
            position: 'absolute',
            inset: '14px',
            background: 'linear-gradient(135deg, var(--c1), var(--c2))',
            borderRadius: '12px',
            opacity: 0.3,
          }} />
          <div style={{
            position: 'absolute',
            bottom: '14px', left: '50%',
            transform: 'translateX(-50%)',
            width: '40px', height: '40px',
            borderRadius: '50%',
            background: 'var(--ink)',
            color: 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'pulseGlow 2s infinite',
          }}>
            <IconCamera size={18} />
          </div>
        </>
      )}
      {kind === 'search' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 500 }}>课堂相册</div>
            <div style={{ position: 'relative' }}>
              <div style={{ color: 'var(--ink)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <div style={{
                position: 'absolute', inset: '-6px',
                border: '1.5px solid var(--c1)',
                borderRadius: '50%',
                animation: 'pulseGlow 2s infinite',
              }} />
            </div>
          </div>
          <div style={{
            background: 'var(--bg-2)',
            borderRadius: '6px',
            padding: '6px 8px',
            marginBottom: '8px',
            fontSize: '9px',
            color: 'var(--ink-soft)',
          }}>
            贝叶斯
          </div>
          <div style={{
            background: 'var(--card)',
            borderRadius: '6px',
            padding: '6px',
            display: 'flex', gap: '6px',
            alignItems: 'flex-start',
          }}>
            <div style={{
              width: '20px', height: '20px',
              background: 'var(--c2)',
              borderRadius: '4px',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: '5px', width: '50%', background: 'var(--line)', borderRadius: '2px' }} />
              <div style={{ height: '4px', width: '70%', background: 'var(--line)', borderRadius: '2px', marginTop: '3px', opacity: 0.5 }} />
              <div style={{ fontSize: '8px', color: 'var(--c1)', marginTop: '4px' }}>
                ...贝叶斯定理...
              </div>
            </div>
          </div>
        </>
      )}
      {kind === 'courses' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 500 }}>课程</div>
            <div style={{
              width: '18px', height: '18px',
              borderRadius: '50%',
              background: 'var(--ink)',
              color: 'var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'pulseGlow 2s infinite',
            }}>
              <IconPlus size={10} stroke={2.5} />
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 0',
              borderTop: '0.5px solid var(--line)',
            }}>
              <div style={{
                width: '20px', height: '20px',
                borderRadius: '5px',
                background: `var(--c${i})`,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: '6px', width: '50%', background: 'var(--line)', borderRadius: '2px' }} />
                <div style={{ height: '4px', width: '30%', background: 'var(--line)', borderRadius: '2px', marginTop: '3px', opacity: 0.6 }} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
