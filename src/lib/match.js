// 课程匹配算法 v2
// 输入：照片元数据（时间戳 + 可选的图像分类结果）+ 课程列表 + 反馈记忆
// 输出：最匹配的课程 + 置信度分 + 决策原因
//
// 融合规则：
// - 时间分（timeScore）：基于课程时段，0-1
// - 内容分（contentScore）：来自 classify.js，0-1
// - 决策：
//   - 不是笔记 + 不在课程时段 → 不入库
//   - 不是笔记 + 在课程时段 → 入库到对应课（用户要的逻辑）
//   - 是笔记 + 在课程时段 → 入库到对应课（最高置信度）
//   - 是笔记 + 不在课程时段 → 入库到"未分类"

export function computeTimeScore(takenAt, courses) {
  if (!takenAt || courses.length === 0) return { course: null, score: 0 };

  const dt = new Date(takenAt);
  const day = dt.getDay();
  const minutes = dt.getHours() * 60 + dt.getMinutes();

  let best = { course: null, score: 0 };

  for (const c of courses) {
    if (c.day !== day) continue;
    const [sh, sm] = c.start.split(':').map(Number);
    const [eh, em] = c.end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    let score = 0;
    if (minutes >= startMin && minutes <= endMin) {
      score = 0.85;
      const mid = (startMin + endMin) / 2;
      const halfRange = (endMin - startMin) / 2;
      const distFromMid = Math.abs(minutes - mid);
      score = 0.85 + 0.1 * (1 - distFromMid / halfRange);
    } else if (minutes >= startMin - 5 && minutes < startMin) {
      score = 0.65;
    } else if (minutes > endMin && minutes <= endMin + 5) {
      score = 0.6;
    }

    if (score > best.score) best = { course: c, score };
  }
  return best;
}

// 主入口：综合所有信号
// classification: { isNote, score, negScore } from classify.js, 可为 null
// 返回 { course, score, decision, reason }
//   decision: 'classified' | 'unclassified' | 'reject'
export function matchPhoto({ takenAt, classification, courses, feedback = {} }) {
  const timeMatch = computeTimeScore(takenAt, courses);
  const inClassTime = timeMatch.course != null;
  const isNote = classification?.isNote ?? null;
  const contentScore = classification?.score ?? null;

  // 应用用户反馈记忆
  let timeScore = timeMatch.score;
  if (timeMatch.course) {
    const memKey = `course_${timeMatch.course.id}`;
    const mem = feedback[memKey];
    if (mem?.correct > mem?.wrong) timeScore = Math.min(1, timeScore + 0.05);
    else if (mem?.wrong > mem?.correct) timeScore = Math.max(0, timeScore - 0.1);
  }

  // 决策树（按用户确认的规则）：
  if (isNote === false) {
    // 明确不是笔记
    if (inClassTime) {
      // 但在课程时段内 → 仍入库（用户偏好：课堂时段拍的非笔记照片可能仍需要保留）
      return {
        course: timeMatch.course,
        score: timeScore * 0.5,  // 置信度打折
        decision: 'classified',
        reason: '非笔记内容，但在课程时段',
        timeScore,
        contentScore,
      };
    } else {
      // 不在课程时段 → 不入库
      return {
        course: null,
        score: 0,
        decision: 'reject',
        reason: '非笔记 + 非课程时段',
        timeScore: 0,
        contentScore,
      };
    }
  }

  // isNote === true 或 null（未分类）
  if (inClassTime) {
    // 是笔记 + 在课程时段 → 高置信度归类
    const finalScore = isNote === true
      ? Math.min(1, timeScore * 0.7 + (contentScore || 0) * 0.3)
      : timeScore;
    return {
      course: timeMatch.course,
      score: finalScore,
      decision: 'classified',
      reason: isNote === true ? '笔记 + 课程时段' : '课程时段',
      timeScore,
      contentScore,
    };
  } else {
    // 是笔记 + 不在课程时段 → 未分类（用户手动指认）
    if (isNote === true) {
      return {
        course: null,
        score: contentScore || 0,
        decision: 'unclassified',
        reason: '笔记内容，但非课程时段',
        timeScore: 0,
        contentScore,
      };
    }
    // 没有分类信息，没有时间匹配 → 未分类
    return {
      course: null,
      score: 0,
      decision: 'unclassified',
      reason: '无信号',
      timeScore: 0,
      contentScore,
    };
  }
}

// 兼容旧调用：只有时间，没有内容分类
export function matchCourse(takenAt, courses, feedback = {}) {
  const r = matchPhoto({ takenAt, classification: null, courses, feedback });
  return { course: r.course, score: r.score };
}
