import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isSupabaseEnabled } from '../lib/supabase.js';

const ADMIN_KEY = 'classnotes2026'; // 部署前请改成你自己的密钥

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [events, setEvents] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshTime, setRefreshTime] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('key') === ADMIN_KEY) setAuthed(true);
  }, []);

  const fetchData = async () => {
    if (!isSupabaseEnabled()) {
      const eventQueue = JSON.parse(localStorage.getItem('cn_event_queue') || '[]');
      const predQueue = JSON.parse(localStorage.getItem('cn_pred_queue') || '[]');
      setEvents(eventQueue);
      setPredictions(predQueue.map(p => ({
        user_id: p.user_id,
        course_id: p.courseId,
        photo_timestamp: p.photoTimestamp,
        pred_score: p.predScore,
        pred_label: p.predLabel,
        source: p.source,
        created_at: p.created_at,
      })));
      setRefreshTime(new Date());
      return;
    }
    setLoading(true);
    try {
      const [evRes, prRes] = await Promise.all([
        supabase.from('events').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('predictions').select('*').order('created_at', { ascending: false }).limit(5000),
      ]);
      setEvents(evRes.data || []);
      setPredictions(prRes.data || []);
      setRefreshTime(new Date());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (authed) fetchData();
  }, [authed]);

  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', background: 'var(--bg)',
      }}>
        <div style={{
          background: 'var(--card)', borderRadius: '16px', padding: '32px',
          maxWidth: '380px', width: '100%',
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>管理后台</div>
          <div style={{ fontSize: '12px', color: 'var(--ink-mute)', marginBottom: '20px' }}>
            或在 URL 后加 ?key=xxx 直接访问
          </div>
          <input
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && keyInput === ADMIN_KEY && setAuthed(true)}
            placeholder="访问密钥"
            type="password"
            style={{
              width: '100%', padding: '12px 14px',
              border: 'none', borderRadius: '10px',
              background: 'var(--bg-2)', fontSize: '14px',
            }}
          />
          <button
            onClick={() => keyInput === ADMIN_KEY && setAuthed(true)}
            className="tap"
            style={{
              width: '100%', marginTop: '12px',
              padding: '12px', background: 'var(--ink)', color: 'var(--bg)',
              borderRadius: '10px', fontSize: '14px', fontWeight: 500,
            }}
          >
            进入
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard events={events} predictions={predictions} loading={loading} refreshTime={refreshTime} onRefresh={fetchData} />;
}

function Dashboard({ events, predictions, loading, refreshTime, onRefresh }) {
  const stats = useMemo(() => {
    const allUsers = new Set();
    events.forEach(e => e.user_id && allUsers.add(e.user_id));
    predictions.forEach(p => p.user_id && allUsers.add(p.user_id));

    const captures = events.filter(e => e.event_type === 'capture');
    const imports = events.filter(e => e.event_type === 'import');
    const feedbacks = events.filter(e => e.event_type === 'feedback');
    const correctFb = feedbacks.filter(e => e.payload?.feedback === 'correct').length;
    const wrongFb = feedbacks.filter(e => e.payload?.feedback === 'wrong').length;

    const onboardCompleted = events.filter(e => e.event_type === 'onboarding' && e.payload?.action === 'next' && e.payload?.step === 2).length;
    const onboardStarted = events.filter(e => e.event_type === 'open').length;

    const totalPhotos = imports.reduce((s, e) => s + (e.payload?.count || 0), 0) + captures.length;

    return {
      users: allUsers.size,
      captures: captures.length,
      imports: imports.reduce((s, e) => s + (e.payload?.count || 0), 0),
      totalPhotos,
      feedbacks: feedbacks.length,
      correctFb,
      wrongFb,
      onboardCompleted,
      onboardStarted,
    };
  }, [events, predictions]);

  // 评估指标（基于反馈作为 ground truth）
  const evalMetrics = useMemo(() => {
    const labeled = predictions.filter(p => p.user_feedback);
    if (labeled.length === 0) return null;
    let TP = 0, FP = 0, FN = 0, TN = 0;
    labeled.forEach(p => {
      const predicted_pos = p.pred_score >= 0.5;
      const truth_pos = p.user_feedback === 'correct';
      if (predicted_pos && truth_pos) TP++;
      else if (predicted_pos && !truth_pos) FP++;
      else if (!predicted_pos && truth_pos) FN++;
      else TN++;
    });
    const precision = TP / (TP + FP) || 0;
    const recall = TP / (TP + FN) || 0;
    const f1 = (2 * precision * recall) / (precision + recall) || 0;
    return { TP, FP, FN, TN, precision, recall, f1, total: labeled.length };
  }, [predictions]);

  // 按来源分解
  const sourceBreakdown = useMemo(() => {
    const groups = {};
    predictions.filter(p => p.user_feedback).forEach(p => {
      const k = p.source || 'unknown';
      if (!groups[k]) groups[k] = { correct: 0, wrong: 0 };
      if (p.user_feedback === 'correct') groups[k].correct++;
      else groups[k].wrong++;
    });
    return Object.entries(groups).map(([k, v]) => ({
      source: k,
      total: v.correct + v.wrong,
      precision: v.correct / (v.correct + v.wrong) || 0,
    })).sort((a, b) => b.total - a.total);
  }, [predictions]);

  // 决策分布：算法把照片分到了哪几桶
  const decisionDist = useMemo(() => {
    const counts = { classified: 0, unclassified: 0, reject: 0 };
    predictions.forEach(p => {
      if (p.decision && counts[p.decision] !== undefined) counts[p.decision]++;
    });
    const total = counts.classified + counts.unclassified + counts.reject;
    return { ...counts, total };
  }, [predictions]);

  // 图像分类评估：基于用户反馈推算
  // 假设：用户对"分类对"的照片 → 这张是真笔记（user_is_note=true）
  // 用户对"分错了"的照片 → 不一定是非笔记，可能是笔记但归错课
  // 严格的 isNote 评估需要用户专门标注，先看一个粗指标
  const classifyMetrics = useMemo(() => {
    const withClassify = predictions.filter(p => p.is_note_pred !== null && p.is_note_pred !== undefined);
    if (withClassify.length === 0) return null;
    const noteCount = withClassify.filter(p => p.is_note_pred === true).length;
    const nonNoteCount = withClassify.filter(p => p.is_note_pred === false).length;

    // 用反馈做有限的验证：用户反馈"对"的照片，分类一定要是 isNote=true 才合理
    const verified = withClassify.filter(p => p.user_feedback);
    let agreeCount = 0;
    verified.forEach(p => {
      // 用户说对 + 模型说是笔记 → 一致
      // 用户说错 + 模型说不是笔记 → 也算一致（虽然反馈"错"未必是因为非笔记）
      if (p.user_feedback === 'correct' && p.is_note_pred === true) agreeCount++;
      else if (p.user_feedback === 'wrong' && p.is_note_pred === false) agreeCount++;
    });
    return {
      total: withClassify.length,
      noteCount,
      nonNoteCount,
      noteRatio: noteCount / withClassify.length,
      verifiedCount: verified.length,
      agreeRate: verified.length > 0 ? agreeCount / verified.length : null,
    };
  }, [predictions]);

  // 14 天行为时序
  const timeline = useMemo(() => {
    const buckets = {};
    events.forEach(e => {
      const d = new Date(e.created_at).toISOString().slice(0, 10);
      if (!buckets[d]) buckets[d] = { date: d, capture: 0, import: 0, feedback: 0 };
      if (e.event_type === 'capture') buckets[d].capture++;
      if (e.event_type === 'import') buckets[d].import += (e.payload?.count || 1);
      if (e.event_type === 'feedback') buckets[d].feedback++;
    });
    return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [events]);

  // 迭代曲线
  const iterCurve = useMemo(() => {
    const sorted = [...predictions].filter(p => p.user_feedback).sort((a, b) =>
      new Date(a.created_at) - new Date(b.created_at)
    );
    const points = [];
    let TP = 0, FP = 0, FN = 0;
    const window = Math.max(1, Math.floor(sorted.length / 30));
    sorted.forEach((p, i) => {
      const predicted_pos = p.pred_score >= 0.5;
      const truth_pos = p.user_feedback === 'correct';
      if (predicted_pos && truth_pos) TP++;
      else if (predicted_pos && !truth_pos) FP++;
      else if (!predicted_pos && truth_pos) FN++;
      if (i % window === 0 || i === sorted.length - 1) {
        const precision = TP / (TP + FP) || 0;
        const recall = TP / (TP + FN) || 0;
        const f1 = (2 * precision * recall) / (precision + recall) || 0;
        points.push({ step: i + 1, precision, recall, f1 });
      }
    });
    return points;
  }, [predictions]);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      padding: '20px',
      maxWidth: '1100px', margin: '0 auto',
    }}>
      {/* 顶栏 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        marginBottom: '24px', paddingBottom: '16px',
        borderBottom: '0.5px solid var(--line)',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--ink-mute)', letterSpacing: '0.15em', fontWeight: 500 }}>
            CLASSNOTES · ADMIN
          </div>
          <h1 style={{ fontSize: '32px', margin: '4px 0 0', fontWeight: 600, color: 'var(--ink)' }}>
            数据看板
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => exportCSV(events, predictions)} className="tap" style={{
            background: 'var(--c2)', padding: '10px 16px', borderRadius: '10px',
            fontSize: '13px', fontWeight: 500,
          }}>
            导出 CSV
          </button>
          <button onClick={onRefresh} className="tap" style={{
            background: 'var(--c1)', padding: '10px 16px', borderRadius: '10px',
            fontSize: '13px', fontWeight: 500,
          }}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>
      </div>

      {!isSupabaseEnabled() && (
        <div style={{
          background: 'var(--c5)', borderRadius: '12px',
          padding: '12px 16px', marginBottom: '20px',
          fontSize: '12px',
        }}>
          ⚠️ Supabase 未配置，当前显示本地队列数据。配置环境变量后将显示所有用户数据。
        </div>
      )}

      {refreshTime && (
        <div style={{ fontSize: '10px', color: 'var(--ink-mute)', marginBottom: '20px', letterSpacing: '0.1em' }}>
          UPDATED {refreshTime.toLocaleString('zh-CN')}
        </div>
      )}

      {/* KPI */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px',
        marginBottom: '28px',
      }}>
        <KPI label="活跃用户" value={stats.users} bg="var(--c1)" />
        <KPI label="拍摄次数" value={stats.captures} bg="var(--c2)" />
        <KPI label="导入张数" value={stats.imports} bg="var(--c3)" />
        <KPI label="用户反馈" value={stats.feedbacks} bg="var(--c5)" />
      </div>

      {/* 评估指标 */}
      <Section title="模型评估" subtitle="基于用户反馈作为 Ground Truth">
        {evalMetrics ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
              <Metric label="精确率" value={evalMetrics.precision} hint={`${evalMetrics.TP}/${evalMetrics.TP + evalMetrics.FP}`} bg="var(--c1)" />
              <Metric label="召回率" value={evalMetrics.recall} hint={`${evalMetrics.TP}/${evalMetrics.TP + evalMetrics.FN}`} bg="var(--c2)" />
              <Metric label="F1" value={evalMetrics.f1} hint={`N = ${evalMetrics.total}`} bg="var(--c3)" />
            </div>

            <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--ink-mute)', marginBottom: '10px', fontWeight: 500 }}>
                CONFUSION MATRIX
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <ConfCell label="TP 真阳性" value={evalMetrics.TP} desc="正确归类" bg="var(--c1)" />
                <ConfCell label="FP 假阳性" value={evalMetrics.FP} desc="错误归类" bg="var(--c3)" />
                <ConfCell label="FN 假阴性" value={evalMetrics.FN} desc="漏掉的" bg="var(--c5)" />
                <ConfCell label="TN 真阴性" value={evalMetrics.TN} desc="正确排除" bg="var(--c4)" />
              </div>
            </div>

            {iterCurve.length > 1 && (
              <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '14px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--ink-mute)', marginBottom: '12px', fontWeight: 500 }}>
                  ITERATION CURVE · 反馈累积下的指标演化
                </div>
                <IterChart data={iterCurve} />
              </div>
            )}
          </>
        ) : (
          <Empty desc="还没有带反馈的数据。让用户在 App 内点对/错按钮，数据会出现在这里。" />
        )}
      </Section>

      {/* 来源分解 */}
      <Section title="按来源分解" subtitle="拍摄 vs 导入 的精确率对比">
        {sourceBreakdown.length > 0 ? (
          <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '14px' }}>
            {sourceBreakdown.map(s => (
              <div key={s.source} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '8px 0',
                borderBottom: '0.5px solid var(--line)',
              }}>
                <div style={{ minWidth: '80px', fontSize: '13px', fontWeight: 500 }}>
                  {s.source === 'capture' ? '拍摄' : s.source === 'import' ? '导入' : s.source}
                </div>
                <div style={{ flex: 1, height: '8px', background: 'var(--bg-2)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${s.precision * 100}%`, height: '100%',
                    background: s.precision > 0.7 ? 'var(--c6)' : s.precision > 0.4 ? 'var(--c5)' : 'var(--c3)',
                    transition: 'width 0.4s',
                  }} />
                </div>
                <div style={{ minWidth: '80px', textAlign: 'right', fontSize: '12px' }}>
                  <span style={{ fontWeight: 600 }}>{(s.precision * 100).toFixed(0)}%</span>
                  <span style={{ color: 'var(--ink-mute)', marginLeft: '6px', fontSize: '10px' }}>n={s.total}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty desc="还没有按来源分解的数据。" />
        )}
      </Section>

      {/* 决策分布 */}
      <Section title="决策分布" subtitle="DECISION FUNNEL · 算法把照片分到了哪几桶">
        {decisionDist.total > 0 ? (
          <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '14px' }}>
            <DecisionFunnel d={decisionDist} />
          </div>
        ) : (
          <Empty desc="尚无决策数据。导入照片后会出现。" />
        )}
      </Section>

      {/* 图像分类指标 */}
      <Section title="图像分类" subtitle="IS-NOTE CLASSIFIER · MobileNet + 关键词映射">
        {classifyMetrics ? (
          <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
              <Metric
                label="是笔记比例"
                value={classifyMetrics.noteRatio}
                hint={`${classifyMetrics.noteCount}/${classifyMetrics.total}`}
                bg="var(--c1)"
              />
              <Metric
                label="非笔记排除"
                value={classifyMetrics.nonNoteCount / classifyMetrics.total}
                hint={`${classifyMetrics.nonNoteCount}/${classifyMetrics.total}`}
                bg="var(--c4)"
              />
              <Metric
                label="反馈一致率"
                value={classifyMetrics.agreeRate || 0}
                hint={classifyMetrics.verifiedCount > 0 ? `n=${classifyMetrics.verifiedCount}` : '需要更多反馈'}
                bg="var(--c5)"
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink-mute)', lineHeight: 1.7 }}>
              <strong>解读：</strong>"是笔记比例"反映用户相册的笔记密度。
              如果"反馈一致率"很低，说明分类器和用户判断有分歧，需要调整关键词映射或考虑 fine-tune 模型。
            </div>
          </div>
        ) : (
          <Empty desc="尚无分类数据。用户导入照片后会出现。" />
        )}
      </Section>

      {/* 时序 */}
      <Section title="行为时序" subtitle="DAILY ACTIVITY · 最近 14 天">
        {timeline.length > 0 ? (
          <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '14px' }}>
            <TimelineChart data={timeline} />
          </div>
        ) : <Empty desc="暂无时序数据。" />}
      </Section>

      {/* 原始事件 */}
      <Section title="原始事件流" subtitle="最近 30 条">
        <div style={{ background: 'var(--card)', borderRadius: '12px', overflow: 'hidden' }}>
          {events.slice(0, 30).map((e, i) => (
            <div key={i} style={{
              padding: '10px 14px',
              borderBottom: i < 29 ? '0.5px solid var(--line)' : 'none',
              display: 'flex', alignItems: 'center', gap: '12px',
              fontSize: '12px',
            }}>
              <span style={{
                background: eventColor(e.event_type),
                padding: '2px 8px', borderRadius: '6px',
                fontSize: '10px', fontWeight: 500,
                minWidth: '70px', textAlign: 'center',
              }}>
                {e.event_type}
              </span>
              <span style={{ color: 'var(--ink-mute)', fontSize: '10px' }}>
                {e.user_id?.slice(0, 8) || '—'}
              </span>
              <span style={{ flex: 1, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {JSON.stringify(e.payload)}
              </span>
              <span style={{ color: 'var(--ink-mute)', fontSize: '10px' }}>
                {new Date(e.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {events.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: '13px' }}>暂无事件</div>}
        </div>
      </Section>
    </div>
  );
}

function eventColor(t) {
  return {
    capture: 'var(--c1)', import: 'var(--c2)', feedback: 'var(--c3)',
    open: 'var(--bg-2)', onboarding: 'var(--c4)',
    photo_view: 'var(--c5)', photo_delete: 'var(--c3)', photo_move: 'var(--c2)',
    course_create: 'var(--c6)', course_update: 'var(--c6)', course_delete: 'var(--c3)',
    classify: 'var(--c5)', search: 'var(--c1)', ocr_index: 'var(--c2)',
    model_load: 'var(--c4)',
  }[t] || 'var(--bg-2)';
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '20px', margin: 0, fontWeight: 600 }}>{title}</h2>
        <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--ink-mute)', fontWeight: 500 }}>
          {subtitle}
        </div>
      </div>
      {children}
    </div>
  );
}

function KPI({ label, value, bg }) {
  return (
    <div style={{
      background: bg, borderRadius: '14px', padding: '16px',
    }}>
      <div style={{ fontSize: '10px', color: 'rgba(0,0,0,0.6)', letterSpacing: '0.1em', fontWeight: 500 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: '36px', lineHeight: 1, marginTop: '6px', fontWeight: 600, color: 'rgba(0,0,0,0.85)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  );
}

function Metric({ label, value, hint, bg }) {
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
      <div style={{ fontSize: '10px', color: 'rgba(0,0,0,0.6)', letterSpacing: '0.1em', fontWeight: 500 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: '32px', fontWeight: 600, color: 'rgba(0,0,0,0.85)', lineHeight: 1, marginTop: '4px', letterSpacing: '-0.02em' }}>
        {(value * 100).toFixed(1)}<span style={{ fontSize: '16px', opacity: 0.6 }}>%</span>
      </div>
      <div style={{ fontSize: '10px', color: 'rgba(0,0,0,0.5)', marginTop: '4px', fontWeight: 500 }}>
        {hint}
      </div>
    </div>
  );
}

function ConfCell({ label, value, desc, bg }) {
  return (
    <div style={{ background: bg, borderRadius: '10px', padding: '12px' }}>
      <div style={{ fontSize: '10px', opacity: 0.7, letterSpacing: '0.1em', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 600, color: 'rgba(0,0,0,0.85)', lineHeight: 1, marginTop: '3px' }}>
        {value}
      </div>
      <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>{desc}</div>
    </div>
  );
}

function DecisionFunnel({ d }) {
  const items = [
    { key: 'classified', label: '已归类', desc: '是笔记 + 课程时段', count: d.classified, color: 'var(--c1)' },
    { key: 'unclassified', label: '未分类', desc: '是笔记 但非课程时段', count: d.unclassified, color: 'var(--c4)' },
    { key: 'reject', label: '已跳过', desc: '非笔记 + 非课程时段', count: d.reject, color: 'var(--c3)' },
  ];
  return (
    <div>
      {items.map(it => {
        const pct = d.total > 0 ? it.count / d.total : 0;
        return (
          <div key={it.key} style={{ marginBottom: '10px' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: '4px',
            }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)' }}>{it.label}</span>
                <span style={{ fontSize: '10px', color: 'var(--ink-mute)', marginLeft: '8px' }}>{it.desc}</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                {it.count}
                <span style={{ fontSize: '10px', color: 'var(--ink-mute)', marginLeft: '6px', fontWeight: 400 }}>
                  {(pct * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div style={{ height: '8px', background: 'var(--bg-2)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${pct * 100}%`, height: '100%',
                background: it.color, transition: 'width 0.4s',
              }} />
            </div>
          </div>
        );
      })}
      <div style={{
        marginTop: '12px',
        fontSize: '10px', color: 'var(--ink-mute)',
        paddingTop: '10px', borderTop: '0.5px solid var(--line)',
      }}>
        总照片数：{d.total}
      </div>
    </div>
  );
}

function IterChart({ data }) {
  const W = 800, H = 200, P = 24;
  const xStep = data.length > 1 ? (W - 2 * P) / (data.length - 1) : 0;
  const yScale = v => H - P - v * (H - 2 * P);
  const path = (key, color, sw = 2) => (
    <path
      d={data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${P + i * xStep} ${yScale(p[key])}`).join(' ')}
      stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round"
    />
  );
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0.25, 0.5, 0.75].map(y => (
          <g key={y}>
            <line x1={P} y1={yScale(y)} x2={W - P} y2={yScale(y)} stroke="#d8d2c8" strokeDasharray="2,4" />
            <text x={P - 4} y={yScale(y) + 4} fontSize="10" textAnchor="end" fill="#999">{(y * 100).toFixed(0)}</text>
          </g>
        ))}
        {path('precision', '#b8a8c8')}
        {path('recall', '#b0b8c8')}
        {path('f1', '#a04848', 2.5)}
        {data.map((p, i) => (
          <circle key={i} cx={P + i * xStep} cy={yScale(p.f1)} r="3" fill="#a04848" />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '11px', color: 'var(--ink-soft)' }}>
        <Legend color="#a04848" label="F1" />
        <Legend color="#b8a8c8" label="精确率" />
        <Legend color="#b0b8c8" label="召回率" />
      </div>
    </div>
  );
}

function TimelineChart({ data }) {
  const W = 800, H = 160, P = 22;
  const max = Math.max(1, ...data.flatMap(d => [d.capture, d.import, d.feedback]));
  const xStep = data.length > 0 ? (W - 2 * P) / data.length : 0;
  const yScale = v => H - P - (v / max) * (H - 2 * P);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {data.map((d, i) => {
          const x = P + i * xStep;
          const w = (xStep - 8) / 3;
          return (
            <g key={i}>
              <rect x={x + 2} y={yScale(d.capture)} width={w} height={H - P - yScale(d.capture)} fill="#b8a8c8" />
              <rect x={x + 2 + w} y={yScale(d.import)} width={w} height={H - P - yScale(d.import)} fill="#b0b8c8" />
              <rect x={x + 2 + 2 * w} y={yScale(d.feedback)} width={w} height={H - P - yScale(d.feedback)} fill="#c8b0b8" />
              <text x={x + xStep / 2} y={H - 4} fontSize="9" textAnchor="middle" fill="#999">{d.date.slice(5)}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '11px', color: 'var(--ink-soft)' }}>
        <Legend color="#b8a8c8" label="拍摄" filled />
        <Legend color="#b0b8c8" label="导入" filled />
        <Legend color="#c8b0b8" label="反馈" filled />
      </div>
    </div>
  );
}

function Legend({ color, label, filled }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{
        width: filled ? '10px' : '14px',
        height: filled ? '10px' : '2px',
        background: color,
        borderRadius: filled ? '2px' : '1px',
      }} />
      {label}
    </span>
  );
}

function Empty({ desc }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '0.5px dashed var(--line)',
      borderRadius: '12px',
      padding: '32px 20px', textAlign: 'center',
      fontSize: '13px', color: 'var(--ink-mute)',
    }}>
      {desc}
    </div>
  );
}

function exportCSV(events, predictions) {
  const csvify = (rows, headers) => {
    const escape = (v) => {
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    return [
      headers.join(','),
      ...rows.map(r => headers.map(h => escape(r[h])).join(','))
    ].join('\n');
  };
  const eventsCSV = csvify(events, ['user_id', 'session_id', 'event_type', 'payload', 'created_at']);
  const predsCSV = csvify(predictions, ['user_id', 'course_id', 'photo_timestamp', 'pred_score', 'pred_label', 'source', 'user_feedback', 'created_at']);
  const download = (name, content) => {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const stamp = new Date().toISOString().slice(0, 10);
  download(`classnotes_events_${stamp}.csv`, eventsCSV);
  setTimeout(() => download(`classnotes_predictions_${stamp}.csv`, predsCSV), 300);
}
