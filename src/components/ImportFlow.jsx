import React, { useState, useEffect, useRef } from 'react';
import { IconClose, IconCpu, IconCheck, IconSparkle } from './Icons.jsx';
import { loadClassifier, classifyImage } from '../lib/classify.js';
import { readPhotoMeta } from '../lib/exif.js';
import { matchPhoto } from '../lib/match.js';
import { saveImage } from '../lib/storage.js';
import { trackPrediction, trackClassify, trackImport, trackModelLoad } from '../lib/analytics.js';

// 导入完整流程：加载模型（首次） → 读 EXIF → 分类 → 时间匹配 → 决策 → 入库
// 三阶段 UI：
//   1. loading_model：模型下载/加载（首次访问 ~14MB，缓存后秒开）
//   2. processing：逐张处理（带进度条）
//   3. summary：结果汇总，让用户对"未分类"做手动操作

export default function ImportFlow({ files, courses, feedback, onClose, onComplete }) {
  const [stage, setStage] = useState('idle');
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStage, setModelStage] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    runImport();
    return () => { cancelRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runImport = async () => {
    // === 阶段 1：加载模型 ===
    setStage('loading_model');
    const t0 = Date.now();
    try {
      await loadClassifier((p) => {
        setModelProgress(p.progress);
        setModelStage(p.stage);
      });
      trackModelLoad({ kind: 'mobilenet', durationMs: Date.now() - t0 });
    } catch (e) {
      console.warn('classifier load failed, fallback to time-only', e);
      // 模型加载失败也继续，退化到只用时间
    }
    if (cancelRef.current) return;

    // === 阶段 2：逐张处理 ===
    setStage('processing');
    setProgress({ done: 0, total: files.length });

    const stats = {
      added: 0,
      classified: 0,
      unclassified: 0,
      rejected: 0,
      noteCount: 0,
      nonNoteCount: 0,
    };
    const newPhotos = [];

    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break;
      const file = files[i];

      try {
        const meta = await readPhotoMeta(file);

        // 分类
        let classification = null;
        try {
          classification = await classifyImage(meta.dataUrl);
          if (classification.isNote) stats.noteCount++;
          else stats.nonNoteCount++;
          trackClassify({
            isNote: classification.isNote,
            score: classification.score,
            negScore: classification.negScore,
            reason: classification.reason,
          });
        } catch (e) {}

        // 匹配
        const result = matchPhoto({
          takenAt: meta.takenAt,
          classification,
          courses,
          feedback,
        });

        // 决策
        if (result.decision === 'reject') {
          stats.rejected++;
          // 不入库
        } else {
          // 入库
          const photo = {
            ...meta,
            courseId: result.course?.id || null,
            predScore: result.score,
            isNote: classification?.isNote ?? null,
            decision: result.decision,
          };
          newPhotos.push(photo);
          await saveImage(meta.id, meta.dataUrl);

          if (result.decision === 'classified') stats.classified++;
          else stats.unclassified++;
          stats.added++;

          // 上报预测
          trackPrediction({
            courseId: result.course?.id || null,
            photoTimestamp: meta.takenAt,
            predScore: result.score,
            predLabel: result.course ? 'class' : 'unclassified',
            source: 'import',
            timeScore: result.timeScore,
            contentScore: result.contentScore,
            isNotePred: classification?.isNote ?? null,
            decision: result.decision,
            reason: result.reason,
          });
        }
      } catch (e) {
        console.warn('process file failed', e);
      }
      setProgress({ done: i + 1, total: files.length });
    }

    if (cancelRef.current) return;

    trackImport({ count: newPhotos.length });

    // === 阶段 3：汇总 ===
    setSummary(stats);
    setStage('summary');
    onComplete(newPhotos);
  };

  return (
    <div className="fade-in" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      zIndex: 1200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div className="slide-up" style={{
        width: '100%', maxWidth: '450px',
        background: 'var(--bg)',
        borderRadius: '24px 24px 0 0',
        padding: '24px 22px max(28px, env(safe-area-inset-bottom))',
        position: 'relative',
      }}>
        {stage === 'loading_model' && (
          <LoadingModel progress={modelProgress} subStage={modelStage} />
        )}
        {stage === 'processing' && (
          <Processing progress={progress} />
        )}
        {stage === 'summary' && summary && (
          <Summary summary={summary} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function LoadingModel({ progress, subStage }) {
  const stages = {
    tf: '初始化推理引擎',
    mobilenet: '加载图像识别模型',
    done: '准备就绪',
    init: '准备中',
    lib: '加载依赖',
    load: '下载语言包',
  };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{
          width: '40px', height: '40px',
          borderRadius: '12px',
          background: 'var(--c1)',
          color: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconCpu size={20} />
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
            首次准备中
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px' }}>
            {stages[subStage] || '加载中…'}
          </div>
        </div>
      </div>

      <div style={{
        height: '6px', background: 'var(--bg-2)',
        borderRadius: '3px', overflow: 'hidden',
        marginBottom: '12px',
      }}>
        <div style={{
          width: `${progress * 100}%`, height: '100%',
          background: 'var(--c1)',
          transition: 'width 0.3s',
        }} />
      </div>

      <div style={{
        fontSize: '11px', color: 'var(--ink-mute)',
        lineHeight: 1.7,
      }}>
        正在下载约 14MB 的图像识别模型，仅首次需要。<br/>
        模型在你的手机上运行，照片不会上传服务器。
      </div>
    </div>
  );
}

function Processing({ progress }) {
  const pct = progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{
          width: '40px', height: '40px',
          borderRadius: '12px',
          background: 'var(--c2)',
          color: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconSparkle size={20} />
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
            正在分析照片
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px' }}>
            {progress.done} / {progress.total}
          </div>
        </div>
      </div>

      <div style={{
        height: '6px', background: 'var(--bg-2)',
        borderRadius: '3px', overflow: 'hidden',
        marginBottom: '12px',
      }}>
        <div style={{
          width: `${pct * 100}%`, height: '100%',
          background: 'var(--c2)',
          transition: 'width 0.2s',
        }} />
      </div>

      <div style={{ fontSize: '11px', color: 'var(--ink-mute)', lineHeight: 1.7 }}>
        识别每张照片是否是课堂笔记，<br/>
        并按拍摄时间归到对应课程。
      </div>
    </div>
  );
}

function Summary({ summary, onClose }) {
  return (
    <div className="fade-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{
          width: '40px', height: '40px',
          borderRadius: '12px',
          background: 'var(--c6)',
          color: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconCheck size={20} stroke={2.5} />
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
            导入完成
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px' }}>
            共处理 {summary.added + summary.rejected} 张
          </div>
        </div>
      </div>

      <div style={{
        background: 'var(--card)',
        borderRadius: '12px',
        padding: '4px 14px',
        marginBottom: '14px',
      }}>
        <Row label="自动归类到课程" value={summary.classified} c="var(--c1)" />
        <Row label="未匹配课程时段" value={summary.unclassified} c="var(--c4)" sub="保留在「未分类」，可手动指认" />
        <Row label="非笔记内容已跳过" value={summary.rejected} c="var(--c3)" sub="自拍/食物/风景等" last />
      </div>

      <div style={{
        background: 'var(--bg-2)',
        borderRadius: '10px',
        padding: '10px 14px',
        marginBottom: '14px',
        display: 'flex', justifyContent: 'space-between',
        fontSize: '11px', color: 'var(--ink-soft)',
      }}>
        <span>识别为笔记：{summary.noteCount}</span>
        <span>非笔记：{summary.nonNoteCount}</span>
      </div>

      <button onClick={onClose} className="tap" style={{
        width: '100%', padding: '14px',
        background: 'var(--ink)', color: 'var(--bg)',
        borderRadius: '12px',
        fontSize: '14px', fontWeight: 500,
      }}>
        完成
      </button>
    </div>
  );
}

function Row({ label, value, c, sub, last }) {
  return (
    <div style={{
      padding: '12px 0',
      borderBottom: last ? 'none' : '0.5px solid var(--line)',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: '10px', color: 'var(--ink-mute)', marginTop: '2px' }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  );
}
