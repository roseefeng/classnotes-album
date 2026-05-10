# 课堂相册

> 拍下笔记，自动识别并归类到对应课程。期末复习一键搜到。

## 核心能力

- **智能归类**：上传相册照片 → 端侧 ML 模型识别"是不是课堂笔记" → 结合拍摄时间自动归到对应课程
- **拍摄即归类**：点击底部圆形按钮拍摄，根据时间自动归到当前正在上的课
- **OCR 文本搜索**：在搜索框输入关键词（如"贝叶斯"），从板书/PPT 文字中找到对应照片
- **课程管理**：在「课程」页添加、编辑、删除课程
- **全屏查看**：点击照片进入全屏，支持双指缩放、左右滑动切换、双击放大
- **隐私优先**：所有图像和 ML 推理在本地浏览器完成，照片不上传服务器

## 技术栈

- **前端**：React 18 + Vite + React Router (HashRouter)
- **端侧 ML**：TensorFlow.js + MobileNetV2（图像分类）
- **OCR**：Tesseract.js（中英文混排）
- **数据采集**：Supabase（PostgreSQL + RLS）
- **部署**：Vercel
- **本地存储**：IndexedDB（图像 + OCR 索引）+ localStorage（元数据）

## 数据闭环

```
用户行为 → 埋点 SDK → Supabase
                          ↓
                    管理后台分析
                          ↓
              发现问题 → 调整算法/规则 → 重新部署
```

埋点事件：open / import / capture / classify / feedback / photo_view / photo_delete / photo_move /
search / ocr_index / model_load / course_create|update|delete / onboarding

预测表字段：time_score / content_score / is_note_pred / decision / reason / user_feedback


## 项目结构

```
src/
├── pages/
│   ├── App.jsx          # 主应用（用户端）
│   └── Admin.jsx        # 管理后台（评估面板）
├── components/
│   ├── Onboarding.jsx   # 首次引导（3 屏）
│   ├── BottomNav.jsx    # 底部导航
│   ├── Camera.jsx       # 相机拍摄
│   ├── PhotoViewer.jsx  # 全屏单图查看
│   ├── CourseEditor.jsx # 课程编辑
│   ├── CourseDetail.jsx # 课程详情页
│   ├── ImportFlow.jsx   # 导入流程（含模型加载和分类）
│   ├── SearchPanel.jsx  # 搜索面板（含 OCR 索引）
│   └── Icons.jsx        # SVG 图标库
├── lib/
│   ├── match.js         # 课程匹配算法（时间 + 内容融合）
│   ├── classify.js      # 图像分类（MobileNet）
│   ├── ocr.js           # OCR 文本提取（Tesseract）
│   ├── search.js        # 搜索索引（IndexedDB）
│   ├── analytics.js     # 埋点 SDK
│   ├── supabase.js      # 数据库客户端
│   ├── exif.js          # EXIF 元数据解析
│   └── storage.js       # 本地数据持久化
├── main.jsx
└── index.css
```

