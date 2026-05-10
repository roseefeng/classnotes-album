import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { IconUpload, IconPlus, IconChevronRight, IconSearch, IconSparkle } from '../components/Icons.jsx';
import BottomNav from '../components/BottomNav.jsx';
import Onboarding from '../components/Onboarding.jsx';
import Camera from '../components/Camera.jsx';
import PhotoViewer from '../components/PhotoViewer.jsx';
import CourseEditor from '../components/CourseEditor.jsx';
import CourseDetail from '../components/CourseDetail.jsx';
import ImportFlow from '../components/ImportFlow.jsx';
import SearchPanel from '../components/SearchPanel.jsx';
import { matchCourse, matchPhoto } from '../lib/match.js';
import { readPhotoMeta } from '../lib/exif.js';
import {
  loadCourses, saveCourses, nextColor,
  loadPhotos, savePhotos,
  saveImage, loadImage, deleteImage,
  loadFeedback, saveFeedback,
  isOnboarded, setOnboarded,
  getLastSync, setLastSync,
} from '../lib/storage.js';
import { deleteOCRText } from '../lib/search.js';
import {
  trackOpen, trackImport, trackCapture, trackPhotoView,
  trackPhotoDelete, trackPhotoMove, trackCourseAction,
  trackPrediction, trackFeedback, flushQueue,
} from '../lib/analytics.js';

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const THUMB_COLORS = ['#3a3a4a', '#4a3a3a', '#3a4a3a', '#4a4a3a', '#3a4a4a', '#4a3a4a'];

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(!isOnboarded());

  const [tab, setTab] = useState('album'); // album | courses
  const [activeCourse, setActiveCourse] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [viewerState, setViewerState] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [importFiles, setImportFiles] = useState(null); // 触发 ImportFlow

  const [courses, setCourses] = useState(loadCourses);
  const [photos, setPhotos] = useState(loadPhotos);
  const [feedback, setFeedback] = useState(loadFeedback);
  const [toast, setToast] = useState(null);

  const fileRef = useRef(null);

  useEffect(() => {
    trackOpen();
    flushQueue();
    const t = setInterval(flushQueue, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { saveCourses(courses); }, [courses]);
  useEffect(() => { savePhotos(photos); }, [photos]);
  useEffect(() => { saveFeedback(feedback); }, [feedback]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // 懒加载缩略图
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const need = photos.filter(p => !p.dataUrl).slice(0, 24);
      for (const p of need) {
        if (cancelled) return;
        const url = await loadImage(p.id);
        if (url && !cancelled) {
          setPhotos(ps => ps.map(x => x.id === p.id ? { ...x, dataUrl: url } : x));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  const getThumbColor = useCallback((p) => {
    const idx = (p.id.charCodeAt(p.id.length - 1) || 0) % THUMB_COLORS.length;
    return THUMB_COLORS[idx];
  }, []);

  const getDataUrl = useCallback(async (id) => {
    const p = photos.find(x => x.id === id);
    if (p?.dataUrl) return p.dataUrl;
    return await loadImage(id);
  }, [photos]);

  // ============== 拍摄（不走 ML 流程，单张快速） ==============
  const handleCapture = async (photo) => {
    setShowCamera(false);
    const matched = matchCourse(photo.takenAt, courses, feedback);
    const enriched = {
      ...photo,
      courseId: matched.course?.id || null,
      predScore: matched.score,
      decision: matched.course ? 'classified' : 'unclassified',
    };
    setPhotos(ps => [...ps, enriched]);
    await saveImage(photo.id, photo.dataUrl);
    trackCapture({
      hasMatch: !!matched.course,
      matchedCourseId: matched.course?.id,
      score: matched.score,
    });
    trackPrediction({
      courseId: matched.course?.id || null,
      photoTimestamp: photo.takenAt,
      predScore: matched.score,
      predLabel: matched.course ? 'class' : 'unclassified',
      source: 'capture',
      timeScore: matched.score,
      contentScore: null,
      isNotePred: null,
      decision: enriched.decision,
      reason: matched.course ? '拍摄即归类' : '拍摄但非课程时段',
    });
    setToast({
      type: 'success',
      text: matched.course ? `已归类到「${matched.course.name}」` : '已保存（当前不在课程时段）',
    });
  };

  // ============== 导入（触发 ImportFlow，含 ML） ==============
  const triggerImport = (files) => {
    if (!files || files.length === 0) return;
    setImportFiles(Array.from(files));
  };

  const handleImportComplete = (newPhotos) => {
    if (newPhotos.length > 0) {
      setPhotos(ps => [...ps, ...newPhotos]);
    }
    setLastSync();
  };

  // ============== 反馈 ==============
  const handleFeedback = (photoId, type) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;
    const newFb = { ...feedback, [photoId]: type };
    if (photo.courseId) {
      const memKey = `course_${photo.courseId}`;
      const mem = newFb[memKey] || { correct: 0, wrong: 0 };
      if (type === 'correct') mem.correct++;
      else mem.wrong++;
      newFb[memKey] = mem;
    }
    setFeedback(newFb);
    trackFeedback({
      courseId: photo.courseId,
      photoTimestamp: photo.takenAt,
      feedback: type,
    });
  };

  const handleDeletePhoto = async (photoId) => {
    setPhotos(ps => ps.filter(p => p.id !== photoId));
    await deleteImage(photoId);
    await deleteOCRText(photoId);
    trackPhotoDelete({ count: 1 });
  };

  const handleMovePhoto = (photoId, toCourseId) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;
    setPhotos(ps => ps.map(p => p.id === photoId ? { ...p, courseId: toCourseId } : p));
    trackPhotoMove({ count: 1, fromCourse: photo.courseId, toCourse: toCourseId });
  };

  const saveCourse = (course) => {
    if (course.id) {
      setCourses(cs => cs.map(c => c.id === course.id ? course : c));
      trackCourseAction('update', { id: course.id, name: course.name });
    } else {
      const newC = { ...course, id: 'c' + Date.now(), color: course.color || nextColor(courses) };
      setCourses(cs => [...cs, newC]);
      trackCourseAction('create', { id: newC.id, name: newC.name });
    }
    setEditingCourse(null);
    setToast({ type: 'success', text: '已保存' });
  };

  const deleteCourse = (id) => {
    setCourses(cs => cs.filter(c => c.id !== id));
    setPhotos(ps => ps.map(p => p.courseId === id ? { ...p, courseId: null } : p));
    trackCourseAction('delete', { id });
    setEditingCourse(null);
    setActiveCourse(null);
    setToast({ type: 'success', text: '已删除' });
  };

  const currentCourse = useMemo(() => {
    const m = matchCourse(new Date().toISOString(), courses, feedback);
    return m.course;
  }, [courses, feedback]);

  // ===================== 渲染分发 =====================

  if (showOnboarding) {
    return <Onboarding onDone={() => { setOnboarded(); setShowOnboarding(false); }} />;
  }

  if (importFiles) {
    return (
      <ImportFlow
        files={importFiles}
        courses={courses}
        feedback={feedback}
        onClose={() => setImportFiles(null)}
        onComplete={handleImportComplete}
      />
    );
  }

  if (showSearch) {
    return (
      <SearchPanel
        photos={photos}
        courses={courses}
        getDataUrl={getDataUrl}
        onClose={() => setShowSearch(false)}
        onOpenPhoto={(photoId) => {
          const photo = photos.find(p => p.id === photoId);
          if (!photo) return;
          // 在搜索面板里点开 → 全屏查看，列表为搜索结果对应课程的全部照片
          const coursePhotos = photo.courseId
            ? photos.filter(p => p.courseId === photo.courseId)
            : [photo];
          const idx = coursePhotos.findIndex(p => p.id === photoId);
          const courseName = courses.find(c => c.id === photo.courseId)?.name || '搜索结果';
          setShowSearch(false);
          setViewerState({ photos: coursePhotos, startIndex: Math.max(0, idx), courseName });
        }}
      />
    );
  }

  if (viewerState) {
    return (
      <PhotoViewer
        photos={viewerState.photos}
        startIndex={viewerState.startIndex}
        courseName={viewerState.courseName}
        getDataUrl={getDataUrl}
        feedback={feedback[viewerState.photos[viewerState.startIndex]?.id]}
        onClose={() => setViewerState(null)}
        onDelete={(id) => handleDeletePhoto(id)}
        onFeedback={handleFeedback}
      />
    );
  }

  if (showCamera) {
    return (
      <Camera
        matchedCourse={currentCourse}
        onCapture={handleCapture}
        onClose={() => setShowCamera(false)}
        onPickFile={() => {
          setShowCamera(false);
          fileRef.current?.click();
        }}
      />
    );
  }

  if (editingCourse) {
    return (
      <CourseEditor
        initial={editingCourse._isNew ? null : editingCourse}
        onSave={saveCourse}
        onCancel={() => setEditingCourse(null)}
        onDelete={deleteCourse}
      />
    );
  }

  if (activeCourse) {
    const coursePhotos = photos
      .filter(p => p.courseId === activeCourse.id)
      .sort((a, b) => (b.takenAt || '').localeCompare(a.takenAt || ''));
    return (
      <div className="app-frame">
        <CourseDetail
          course={activeCourse}
          photos={coursePhotos}
          courses={courses}
          onBack={() => setActiveCourse(null)}
          onOpenPhoto={(photoId) => {
            const idx = coursePhotos.findIndex(p => p.id === photoId);
            setViewerState({
              photos: coursePhotos,
              startIndex: idx,
              courseName: activeCourse.name,
            });
            trackPhotoView({ photoId });
          }}
          onDelete={handleDeletePhoto}
          onMove={handleMovePhoto}
          getThumbColor={getThumbColor}
        />
        <BottomNav tab="courses" onTabChange={(t) => { setActiveCourse(null); setTab(t); }} onCapture={() => setShowCamera(true)} />
        {toast && <Toast {...toast} />}
      </div>
    );
  }

  return (
    <div className="app-frame">
      {tab === 'album' && (
        <AlbumView
          courses={courses}
          photos={photos}
          onPickCourse={setActiveCourse}
          onImport={() => fileRef.current?.click()}
          onSearch={() => setShowSearch(true)}
          onOpenRecent={(photoId) => {
            const recent = [...photos].sort((a, b) => (b.takenAt || '').localeCompare(a.takenAt || ''));
            const idx = recent.findIndex(p => p.id === photoId);
            setViewerState({
              photos: recent,
              startIndex: idx,
              courseName: '最近',
            });
            trackPhotoView({ photoId });
          }}
          onOpenUnclassified={() => {
            const unc = photos.filter(p => !p.courseId);
            if (unc.length === 0) return;
            setViewerState({ photos: unc, startIndex: 0, courseName: '未分类' });
          }}
          getThumbColor={getThumbColor}
        />
      )}
      {tab === 'courses' && (
        <CoursesView
          courses={courses}
          photos={photos}
          onPickCourse={setActiveCourse}
          onAddCourse={() => setEditingCourse({ _isNew: true })}
          onEditCourse={(c) => setEditingCourse(c)}
        />
      )}

      <BottomNav tab={tab} onTabChange={setTab} onCapture={() => setShowCamera(true)} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          triggerImport(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />

      {toast && <Toast {...toast} />}
    </div>
  );
}

// =============== 相册主页 ===============
function AlbumView({ courses, photos, onPickCourse, onImport, onSearch, onOpenRecent, onOpenUnclassified, getThumbColor }) {
  const recent = useMemo(() =>
    [...photos]
      .sort((a, b) => (b.takenAt || '').localeCompare(a.takenAt || ''))
      .slice(0, 4),
    [photos]
  );

  const photoCountByCourse = useMemo(() => {
    const map = {};
    photos.forEach(p => {
      if (!p.courseId) return;
      map[p.courseId] = (map[p.courseId] || 0) + 1;
    });
    return map;
  }, [photos]);

  const unclassified = photos.filter(p => !p.courseId).length;
  const lastSync = getLastSync();

  return (
    <div className="fade-up" style={{ paddingBottom: '110px' }}>
      <div style={{
        padding: 'max(20px, env(safe-area-inset-top)) 22px 22px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}>
            课堂相册
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {photos.length > 0 && (
            <button onClick={onSearch} className="tap" style={{
              color: 'var(--ink)', padding: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconSearch size={16} stroke={1.6} />
            </button>
          )}
          <button onClick={onImport} className="tap" style={{
            color: 'var(--ink)', padding: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconUpload size={16} stroke={1.6} />
          </button>
        </div>
      </div>

      {/* 一键同步建议（用户首次或长时间未同步） */}
      {photos.length === 0 && courses.length > 0 && (
        <div style={{ padding: '0 22px 16px' }}>
          <button onClick={onImport} className="tap" style={{
            width: '100%',
            background: 'linear-gradient(135deg, var(--c1), var(--c2))',
            borderRadius: '14px',
            padding: '20px 18px',
            display: 'flex', alignItems: 'center', gap: '14px',
            textAlign: 'left',
          }}>
            <div style={{
              width: '40px', height: '40px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.4)',
              color: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <IconSparkle size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(0,0,0,0.85)' }}>
                一键导入相册笔记
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(0,0,0,0.6)', marginTop: '3px', lineHeight: 1.5 }}>
                自动识别课堂笔记 · 按时间归到对应课程
              </div>
            </div>
          </button>
        </div>
      )}

      {courses.length === 0 ? (
        <div style={{
          margin: '0 22px',
          padding: '40px 20px',
          textAlign: 'center',
          background: 'var(--card)',
          borderRadius: '14px',
          color: 'var(--ink-mute)',
          fontSize: '13px',
        }}>
          还没有课程，去「课程」页添加
        </div>
      ) : (
        <div style={{
          padding: '0 22px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
        }}>
          {courses.map(c => {
            const count = photoCountByCourse[c.id] || 0;
            return (
              <button
                key={c.id}
                onClick={() => onPickCourse(c)}
                className="tap"
                style={{
                  background: c.color,
                  aspectRatio: 1,
                  borderRadius: '14px',
                  padding: '14px',
                  position: 'relative',
                  overflow: 'hidden',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  fontSize: '12px',
                  color: 'rgba(0,0,0,0.65)',
                  fontWeight: 500,
                }}>
                  {c.name}
                </div>
                <div style={{
                  position: 'absolute',
                  left: '14px',
                  bottom: '14px',
                  fontSize: '36px',
                  fontWeight: 600,
                  color: 'rgba(0,0,0,0.85)',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}>
                  {count}
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    opacity: 0.6,
                    marginLeft: '2px',
                  }}>张</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {unclassified > 0 && (
        <div style={{ padding: '8px 22px 0' }}>
          <button
            onClick={onOpenUnclassified}
            className="tap"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'var(--card)',
              borderRadius: '10px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              border: '1px dashed var(--line)',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
              <span style={{ fontWeight: 600 }}>{unclassified}</span> 张未匹配课程
            </div>
            <IconChevronRight size={14} />
          </button>
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ padding: '20px 22px 0' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '10px',
          }}>
            <div style={{
              fontSize: '11px',
              color: 'var(--ink-mute)',
              letterSpacing: '0.12em',
              fontWeight: 500,
            }}>
              最近
            </div>
            {lastSync && (
              <div style={{ fontSize: '10px', color: 'var(--ink-mute)' }}>
                上次导入 {timeAgo(lastSync)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {recent.map(p => (
              <button
                key={p.id}
                onClick={() => onOpenRecent(p.id)}
                className="tap"
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  background: p.dataUrl ? `url(${p.dataUrl}) center/cover` : getThumbColor(p),
                  borderRadius: '8px',
                  padding: 0,
                  border: 'none',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {photos.length === 0 && courses.length === 0 && (
        <div style={{
          margin: '24px 22px 0',
          padding: '36px 20px',
          textAlign: 'center',
          background: 'var(--card)',
          borderRadius: '14px',
        }}>
          <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500, marginBottom: '6px' }}>
            还没有照片
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ink-mute)', lineHeight: 1.6 }}>
            点击右上角箭头从相册导入<br />
            或点击底部圆形按钮拍摄
          </div>
        </div>
      )}
    </div>
  );
}

// =============== 课程列表页 ===============
function CoursesView({ courses, photos, onPickCourse, onAddCourse, onEditCourse }) {
  const photoCountByCourse = useMemo(() => {
    const map = {};
    photos.forEach(p => {
      if (!p.courseId) return;
      map[p.courseId] = (map[p.courseId] || 0) + 1;
    });
    return map;
  }, [photos]);

  return (
    <div className="fade-up" style={{ paddingBottom: '110px' }}>
      <div style={{
        padding: 'max(20px, env(safe-area-inset-top)) 22px 22px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}>
            课程
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink-mute)', fontWeight: 500 }}>
            {courses.length} 门
          </div>
        </div>
        <button
          onClick={onAddCourse}
          className="tap"
          style={{
            width: '28px', height: '28px',
            borderRadius: '50%',
            background: 'var(--ink)',
            color: 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <IconPlus size={14} stroke={2.5} />
        </button>
      </div>

      <div style={{ padding: '0 22px' }}>
        {courses.length === 0 && (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            background: 'var(--card)',
            borderRadius: '14px',
            color: 'var(--ink-mute)',
            fontSize: '13px',
          }}>
            还没有课程<br />
            <span style={{ fontSize: '11px', opacity: 0.7 }}>
              点击右上角「+」添加你的第一门课
            </span>
          </div>
        )}
        {courses.map((c, i) => (
          <div
            key={c.id}
            className="fade-up"
            style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 0',
              borderTop: i === 0 ? '0.5px solid var(--line)' : 'none',
              borderBottom: '0.5px solid var(--line)',
              animationDelay: `${i * 0.04}s`,
            }}
          >
            <div style={{
              width: '36px', height: '36px',
              borderRadius: '10px',
              background: c.color,
              flexShrink: 0,
            }} />
            <button
              onClick={() => onPickCourse(c)}
              className="tap"
              style={{
                flex: 1, padding: 0, textAlign: 'left',
                background: 'transparent',
              }}
            >
              <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>
                {c.name}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--ink-mute)', marginTop: '2px' }}>
                周{DAY_NAMES[c.day]} {c.start}–{c.end}
              </div>
            </button>
            <div style={{
              fontSize: '14px',
              color: 'var(--ink-mute)',
              fontWeight: 600,
            }}>
              {photoCountByCourse[c.id] || 0}
            </div>
            <button
              onClick={() => onEditCourse(c)}
              className="tap"
              style={{ color: 'var(--ink-mute)', padding: '4px' }}
            >
              <IconChevronRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toast({ type, text }) {
  return (
    <div className="fade-up" style={{
      position: 'fixed',
      bottom: 'max(110px, calc(env(safe-area-inset-bottom) + 100px))',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--ink)',
      color: 'var(--bg)',
      padding: '10px 18px',
      borderRadius: '100px',
      fontSize: '12px',
      fontWeight: 500,
      zIndex: 300,
      whiteSpace: 'nowrap',
      maxWidth: 'calc(100% - 40px)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      {text}
    </div>
  );
}

function timeAgo(date) {
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}
