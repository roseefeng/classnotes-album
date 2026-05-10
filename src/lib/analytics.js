// 埋点统一入口
// 所有用户行为通过 track() 上报，便于后台聚合分析
import { supabase } from './supabase.js';

function getUserId() {
  let uid = localStorage.getItem('cn_uid');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem('cn_uid', uid);
  }
  return uid;
}

const SESSION_ID = 's_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export async function track(eventType, payload = {}) {
  const event = {
    user_id: getUserId(),
    session_id: SESSION_ID,
    event_type: eventType,
    payload,
    user_agent: navigator.userAgent,
    created_at: new Date().toISOString(),
  };

  if (!supabase) {
    const queue = JSON.parse(localStorage.getItem('cn_event_queue') || '[]');
    queue.push(event);
    localStorage.setItem('cn_event_queue', JSON.stringify(queue.slice(-500)));
    return;
  }

  try {
    await supabase.from('events').insert(event);
  } catch (e) {
    console.warn('track failed', e);
  }
}

export async function trackPrediction({
  courseId, photoTimestamp, predScore, predLabel, source,
  timeScore, contentScore, isNotePred, decision, reason,
}) {
  if (!supabase) {
    const queue = JSON.parse(localStorage.getItem('cn_pred_queue') || '[]');
    queue.push({
      user_id: getUserId(), session_id: SESSION_ID,
      courseId, photoTimestamp, predScore, predLabel, source,
      timeScore, contentScore, isNotePred, decision, reason,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('cn_pred_queue', JSON.stringify(queue.slice(-2000)));
    return;
  }
  try {
    await supabase.from('predictions').insert({
      user_id: getUserId(),
      session_id: SESSION_ID,
      course_id: courseId,
      photo_timestamp: photoTimestamp,
      pred_score: predScore,
      pred_label: predLabel,
      source,
      time_score: timeScore,
      content_score: contentScore,
      is_note_pred: isNotePred,
      decision,
      reason,
    });
  } catch (e) {
    console.warn('trackPrediction failed', e);
  }
}

export async function trackFeedback({ courseId, photoTimestamp, feedback }) {
  await track('feedback', { courseId, photoTimestamp, feedback });
  if (!supabase) return;
  try {
    await supabase
      .from('predictions')
      .update({ user_feedback: feedback, feedback_at: new Date().toISOString() })
      .eq('user_id', getUserId())
      .eq('course_id', courseId)
      .eq('photo_timestamp', photoTimestamp);
  } catch (e) {
    console.warn('feedback update failed', e);
  }
}

export async function trackOpen() { return track('open', { url: window.location.href }); }
export async function trackImport({ count }) { return track('import', { count }); }
export async function trackCapture(payload) { return track('capture', payload); }
export async function trackPhotoView({ photoId }) { return track('photo_view', { photoId }); }
export async function trackPhotoDelete({ count }) { return track('photo_delete', { count }); }
export async function trackPhotoMove({ count, fromCourse, toCourse }) { return track('photo_move', { count, fromCourse, toCourse }); }
export async function trackCourseAction(action, courseData) { return track('course_' + action, courseData); }
export async function trackOnboarding({ step, action }) { return track('onboarding', { step, action }); }
export async function trackClassify(payload) { return track('classify', payload); }
export async function trackSearch({ query, hits }) { return track('search', { query, hits }); }
export async function trackOCR({ count, durationMs }) { return track('ocr_index', { count, durationMs }); }
export async function trackModelLoad({ kind, durationMs }) { return track('model_load', { kind, durationMs }); }

export async function flushQueue() {
  if (!supabase) return;
  const queue = JSON.parse(localStorage.getItem('cn_event_queue') || '[]');
  if (queue.length > 0) {
    try {
      await supabase.from('events').insert(queue);
      localStorage.removeItem('cn_event_queue');
    } catch (e) {}
  }
  const predQueue = JSON.parse(localStorage.getItem('cn_pred_queue') || '[]');
  if (predQueue.length > 0) {
    try {
      const rows = predQueue.map(p => ({
        user_id: p.user_id,
        session_id: p.session_id,
        course_id: p.courseId,
        photo_timestamp: p.photoTimestamp,
        pred_score: p.predScore,
        pred_label: p.predLabel,
        source: p.source,
        time_score: p.timeScore,
        content_score: p.contentScore,
        is_note_pred: p.isNotePred,
        decision: p.decision,
        reason: p.reason,
        created_at: p.created_at,
      }));
      await supabase.from('predictions').insert(rows);
      localStorage.removeItem('cn_pred_queue');
    } catch (e) {}
  }
}

export { getUserId };
