// 端侧图像分类
// 用 MobileNet 预训练模型 + 关键词映射判断"是否课堂笔记"
//
// 思路：MobileNet 输出 ImageNet 1000 类的概率分布。
// 我们不直接用 top-1，而是看预测的 top-K 类别中，
// 是否命中"笔记/书本/屏幕/黑板"这类词，并扣除"食物/人脸/动物/风景"的负向词。
//
// 这是零样本（zero-shot）方法，不需要训练数据。
// 优点：上线快、不需要数据；缺点：不如 fine-tune 准。
// 后续有 200+ 用户标注数据后，可以改用 fine-tune 的二分类头替换 keyword 匹配。

import * as tf from '@tensorflow/tfjs';

let modelPromise = null;
let mobilenetModule = null;
let model = null;

// 正向词：包含这些类别名 → 像笔记
const POSITIVE_KEYWORDS = [
  'notebook', 'book', 'jacket', 'menu', 'paper', 'envelope',
  'screen', 'monitor', 'television', 'desktop', 'desk',
  'binder', 'folder', 'stationery', 'pen', 'ballpoint',
  'crossword', 'puzzle', 'website', 'web site',
  'comic book', 'magazine', 'jigsaw',
  'scoreboard', 'menu', 'packet',
  'rule', 'ruler',
];

// 负向词：包含这些 → 不是笔记
const NEGATIVE_KEYWORDS = [
  // 食物
  'pizza', 'cup', 'bowl', 'plate', 'sandwich', 'burger',
  'noodle', 'soup', 'rice', 'bread', 'cake', 'pasta',
  'banana', 'apple', 'orange', 'fruit',
  'wine', 'beer', 'coffee', 'tea', 'espresso',
  'chocolate', 'cookie', 'ice cream',
  'restaurant', 'eatery', 'dining',
  // 人/动物
  'face', 'person', 'man', 'woman', 'child', 'baby',
  'dog', 'cat', 'bird', 'fish', 'horse', 'cow', 'sheep',
  // 风景
  'sky', 'cloud', 'mountain', 'beach', 'sea', 'lake', 'river',
  'tree', 'flower', 'forest', 'park', 'garden',
  'sunset', 'sunrise', 'dawn',
  // 交通
  'car', 'bicycle', 'motorbike', 'bus', 'train',
  // 室内人脸自拍场景
  'shower', 'bathtub', 'toilet', 'bed',
];

export async function loadClassifier(onProgress) {
  if (model) return model;
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    onProgress?.({ stage: 'tf', progress: 0.1 });
    await tf.ready();
    // 优先 webgl，失败回落 cpu
    try {
      await tf.setBackend('webgl');
    } catch (e) {
      await tf.setBackend('cpu');
    }
    onProgress?.({ stage: 'tf', progress: 0.3 });

    if (!mobilenetModule) {
      mobilenetModule = await import('@tensorflow-models/mobilenet');
    }
    onProgress?.({ stage: 'mobilenet', progress: 0.5 });

    // version 2 alpha 0.5 较小（~14MB），手机上可接受
    model = await mobilenetModule.load({ version: 2, alpha: 0.5 });
    onProgress?.({ stage: 'done', progress: 1 });
    return model;
  })();
  return modelPromise;
}

export function isClassifierLoaded() {
  return !!model;
}

// 输入图像（HTMLImageElement / Canvas / dataUrl），输出 {isNote, score, topClasses, reason}
export async function classifyImage(input) {
  if (!model) {
    throw new Error('classifier not loaded; call loadClassifier first');
  }

  // 把 dataUrl 转成 image 元素
  let imgEl = input;
  if (typeof input === 'string') {
    imgEl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = input;
    });
  }

  const predictions = await model.classify(imgEl, 5);

  // 计算正负向得分
  let posScore = 0;
  let negScore = 0;
  const matched = { positive: [], negative: [] };

  for (const p of predictions) {
    const cls = p.className.toLowerCase();
    let hitPos = false, hitNeg = false;
    for (const kw of POSITIVE_KEYWORDS) {
      if (cls.includes(kw)) {
        posScore += p.probability;
        matched.positive.push({ kw, cls, prob: p.probability });
        hitPos = true;
        break;
      }
    }
    if (!hitPos) {
      for (const kw of NEGATIVE_KEYWORDS) {
        if (cls.includes(kw)) {
          negScore += p.probability;
          matched.negative.push({ kw, cls, prob: p.probability });
          hitNeg = true;
          break;
        }
      }
    }
  }

  // 决策：正分明显高于负分 → 是笔记
  // 阈值经验值，后续可根据用户反馈调
  const score = posScore - negScore;
  const isNote = score > 0.05 || (posScore > 0.15 && negScore < 0.1);

  let reason;
  if (matched.positive.length > 0) {
    reason = `命中: ${matched.positive[0].cls}`;
  } else if (matched.negative.length > 0) {
    reason = `非笔记特征: ${matched.negative[0].cls}`;
  } else {
    reason = `top-1: ${predictions[0]?.className || 'unknown'}`;
  }

  return {
    isNote,
    score: Math.max(0, Math.min(1, posScore)),
    negScore: Math.max(0, Math.min(1, negScore)),
    topClasses: predictions.map(p => ({ name: p.className, prob: p.probability })),
    reason,
  };
}

// 批量分类（顺序执行避免内存爆掉）
export async function classifyBatch(inputs, onProgress) {
  const results = [];
  for (let i = 0; i < inputs.length; i++) {
    try {
      const r = await classifyImage(inputs[i]);
      results.push(r);
    } catch (e) {
      results.push({ isNote: true, score: 0, negScore: 0, reason: 'classify_failed', error: e.message });
    }
    onProgress?.({ done: i + 1, total: inputs.length });
  }
  return results;
}
