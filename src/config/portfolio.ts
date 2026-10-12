/** Six selected fields, printed on Paper A through Paper F. */
export type PaperId = 'paper-a' | 'paper-b' | 'paper-c' | 'paper-d' | 'paper-e' | 'paper-f';
export type Stage = 'intro' | PaperId | 'screen';
export type ProjectStyle = 'contour' | 'signal' | 'lattice' | 'orbit' | 'prism' | 'waves';

export interface PortfolioProject {
  id: PaperId;
  number: string;
  tag: string;
  title: string;
  heroHeading: string;
  subtitle: string;
  summary: string;
  description: string;
  category: string;
  year: string;
  keywords: string[];
  style: ProjectStyle;
  accent: string;
  // Enable this when replacing the authored paper ink with the project's
  // config-driven print layout. Geometry and baked illumination stay intact.
  editablePrint?: boolean;
  works?: { title: string; description: string; url?: string }[];
  achievements?: string[];
  website?: string;
}

export const portfolio = {
  name: 'Corden',
  monogram: 'C',
  discipline: 'RESEARCH  /  ENGINEERING  /  IDEAS',
  headline: ['NOT EVERYTHING', 'STAYS ON', 'PAPER.'],
  introduction: 'A journey through ideas, experiments, and the work that makes them real.',
  email: '',
  github: 'https://github.com/Corden404',
  // The physical monitor displays this local profile capture; its link opens
  // the live GitHub page. Featured paper ink comes from the content below.
  monitorImage: '/assets/realtime/github-profile.png',
  // Set this to 1–6 to showcase fewer papers. Visitors can always skip to the
  // computer; the full catalogue below still shows all six listed projects.
  featuredPaperCount: 6,
  projects: [
    {
      id: 'paper-a', number: '01', tag: '本地大模型与智能体',
      title: '让模型\n真正行动', heroHeading: '让模型\n真正行动',
      subtitle: '从语言模型到实际行动，让 AI 不止于对话。',
      summary: '本地部署 Qwen 3.5 9B，通过 llama.cpp 提供模型推理服务，并使用结构化 API 连接智能体的规划、行动与环境反馈。',
      description: 'Qwen Beats Minecraft', category: '本地大模型与智能体', year: '2026',
      works: [{ title: 'Qwen Beats Minecraft', url: 'https://github.com/Corden404/qwen-beat-minecraft', description: '本地部署 Qwen 3.5 9B，通过 llama.cpp 提供模型推理服务，并使用结构化 API 连接智能体的规划、行动与环境反馈。' }],
      achievements: ['Qwen 3.5 9B 本地部署与 API 接入', '大模型驱动游戏中的自主决策与行动', '固定场景下单次验证通关：13 分 55 秒'],
      keywords: ['本地大模型', 'llama.cpp', 'AI Agent'],
      style: 'contour', accent: '#71999c', editablePrint: true,
    },
    {
      id: 'paper-b', number: '02', tag: '计算机视觉与实时检测',
      title: '让机器\n理解画面', heroHeading: '让机器\n理解画面',
      subtitle: '从数据到模型，从模型到实时视觉感知。',
      summary: '基于 Ultralytics YOLOv8 构建游戏人物检测系统，覆盖数据准备、模型训练、性能验证与流式视觉推理。',
      description: 'YOLO Enemy Detection', category: '计算机视觉与实时检测', year: '2026',
      works: [{ title: 'YOLO Enemy Detection', url: 'https://github.com/Corden404/YOLO-Enemy-Detection', description: '基于 Ultralytics YOLOv8 构建游戏人物检测系统，覆盖数据准备、模型训练、性能验证与流式视觉推理。' }],
      achievements: ['YOLOv8n 目标检测模型', '视频抽帧、数据集构建与模型训练', '支持图片、视频、摄像头及视频流推理'],
      keywords: ['YOLOv8', 'PyTorch', '目标检测'],
      style: 'signal', accent: '#9ea8a1', editablePrint: true,
    },
    {
      id: 'paper-c', number: '03', tag: 'Harness 与 AI 工具链',
      title: '构建 AI\n背后的工具', heroHeading: '构建 AI\n背后的工具',
      subtitle: '让 AI 不仅能思考，也能使用工具完成工作。',
      summary: '参与开源 AI 开发平台 WebCodex 的开发，并将学术论文排版流程封装为可复用的 AI Skill。',
      description: 'WebCodex 开源贡献 / SCAU Thesis Formatter Skill', category: 'Harness 与 AI 工具链', year: '2026',
      works: [
        { title: 'WebCodex 开源贡献', url: 'https://github.com/yyjeqhc/webcodex/pulls?q=is%3Apr+is%3Amerged+author%3ACorden404', description: '参与开源 AI 开发平台 WebCodex 的开发，累计向上游贡献 22 个已合并 Pull Request，涉及桌面运行环境、MCP、浏览器自动化及文档处理等模块。' },
        { title: 'SCAU Thesis Formatter Skill', url: 'https://github.com/Corden404/scau-thesis-formatter-skill', description: '将学术论文排版流程封装为可复用的 AI Skill，通过文档解析、格式处理与自动化工具完成 DOCX/PDF 排版工作。' },
      ],
      achievements: ['WebCodex 上游已合并 22 个 PR', 'AI 开发工具及运行环境改进', '可复用的论文排版自动化 Skill'],
      keywords: ['Harness', 'MCP', 'AI Skill'],
      style: 'lattice', accent: '#8aaba9', editablePrint: true,
    },
    {
      id: 'paper-d', number: '04', tag: '智能决策与数据建模',
      title: '从数据预测\n到智能决策', heroHeading: '从数据预测\n到智能决策',
      subtitle: '用数据认识问题，用算法寻找更优决策。',
      summary: '结合状态估计与策略规划设计智能决策系统，通过特征工程及多模型融合完成电动汽车购买意向预测。',
      description: 'SMP2026 Starnet Agent / Kaggle S6E9 — EV Purchase Prediction', category: '智能决策与数据建模', year: '2026',
      works: [
        { title: 'SMP2026 Starnet Agent', url: 'https://github.com/Corden404/SMP2026-Starnet-Agent-Public', description: '面向星网挑战赛设计智能决策系统，结合网络拓扑分析、环境侦察、状态估计与策略规划，在有限资源下选择行动。' },
        { title: 'Kaggle S6E9 — EV Purchase Prediction', url: 'https://www.kaggle.com/competitions/playground-series-s6e9', description: '通过特征工程、交叉验证及 LightGBM、XGBoost 等模型融合，完成电动汽车购买意向预测任务。' },
      ],
      achievements: ['SMP2026 星网挑战赛：排名前 20%', 'Kaggle S6E9：排名前 20%', '智能体策略优化与多模型训练、评估及融合'],
      keywords: ['机器学习', '数据分析', '策略优化'],
      style: 'orbit', accent: '#99aca0', editablePrint: true,
    },
    {
      id: 'paper-e', number: '05', tag: '创意编程与三维交互',
      title: '让创意\n拥有空间', heroHeading: '让创意\n拥有空间',
      subtitle: '以技术构建空间，让想象成为可以探索的世界。',
      summary: '构建可交互的微缩世界与粒子雕塑，以 WebGL 实时渲染创造具有空间感的数字体验。',
      description: 'One World / Particle Camera Flight', category: '创意编程与三维交互', year: '2026',
      works: [
        { title: 'One World', url: 'https://github.com/Corden404/One-World', description: '构建十二个可交互的微缩世界，以深度视差、日夜光照变化和连续滚动探索，创造具有空间感的数字体验。' },
        { title: 'Particle Camera Flight', url: 'https://github.com/Corden404/particle-camera-flight', description: '结合 Blender 摄影机路径、Three.js 和粒子系统，将三维雕塑转化为可交互的粒子动画，构建电影感个人主页。' },
      ],
      achievements: ['12 幕可交互的微缩世界', '36,000 采样点的粒子雕塑形态', 'WebGL 实时渲染与交互动画'],
      keywords: ['Three.js', 'WebGL', 'Blender'],
      style: 'prism', accent: '#78979c', editablePrint: true,
    },
    {
      id: 'paper-f', number: '06', tag: 'Web 应用与产品工程',
      title: '把想法\n做成产品', heroHeading: '把想法\n做成产品',
      subtitle: '从功能设计到上线使用，让技术真正服务于需求。',
      summary: '基于 Vue 3、Tailwind CSS 与 Supabase 开发的在线学习平台，围绕真实备考需求，实现智能练习、错题管理、学习数据同步与知识分享。',
      description: 'MaoGai Quiz Tool', category: 'Web 应用与产品工程', year: '2026',
      works: [{ title: 'MaoGai Quiz Tool', url: 'https://github.com/Corden404/MaoGai-Quiz-Tool', description: '基于 Vue 3、Tailwind CSS 与 Supabase 开发的在线学习平台，围绕真实备考需求，实现智能练习、错题管理、学习数据同步与知识分享。' }],
      achievements: ['双科目题库与个性化练习', '错题复习、笔记分享及多格式导出', 'Supabase 用户认证与跨设备进度同步'],
      website: 'scau-test.top',
      keywords: ['Vue 3', 'Supabase', 'Web 应用'],
      style: 'waves', accent: '#90b3af', editablePrint: true,
    },
  ] satisfies PortfolioProject[],
};

export const featuredProjects: PortfolioProject[] = portfolio.projects.slice(
  0,
  Math.max(1, Math.min(portfolio.featuredPaperCount, portfolio.projects.length)),
);

export const stages: Stage[] = ['intro', ...featuredProjects.map((p) => p.id), 'screen'];

// V4 keeps the six-paper camera route; the opening matches reference frame 25.
export const stageFrames: Record<Stage, number> = {
  intro: 25,
  'paper-a': 109,
  'paper-b': 205,
  'paper-c': 288,
  'paper-d': 372,
  'paper-e': 456,
  'paper-f': 541,
  screen: 654,
};
