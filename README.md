# HealthGuardian (健康守护者) 🛰️

> **⚠️ 开发者备忘录 (Developer Rules)**
> **【双文档同步约束】每次新功能开发或脚本调整完成后，必须立即同步更新 `README.md` 和 `快速运行.md` 这两个核心文档，确保项目功能描述与启动/打包脚本记录时刻保持最新对齐。相关的部署与启动脚本命令仅在 `快速运行.md` 中维护。**

这是一个融合了 **Java Spring Boot 后端**、**Electron 桌面壳层**与 **TensorFlow.js 计算机视觉**的全维度健康守护平台。它不仅仅是一个提醒工具，更是一个通过 AI 技术实时监测用户状态的智能健康底座。

---

## 🏗️ 系统架构 (Architecture)

HealthGuardian 采用混合架构模式，确保了 Web 技术的灵活性与桌面应用的原生能力：

1.  **后端 (Spring Boot)**: 核心业务逻辑层。负责 RESTful API 提供、静态资源托管、MySQL 数据持久化及 Webhook 消息分发。
2.  **前端 (SPA)**: 基于 Vanilla JS 的单页应用。集成 Chart.js 进行数据可视化，并利用 TensorFlow.js (MoveNet 模型) 在浏览器端进行实时坐姿检测。
3.  **桌面端 (Electron)**: 作为跨平台外壳，提供系统托盘、全局快捷键、窗口管理及本地服务自启动/连接管理。

---

## 🛠️ 技术矩阵 (Tech Stack)

*   **后端内核**: Java 8 / Spring Boot 2.7.5
*   **数据层**: MySQL 8.0 (持久化用户配置、健康统计及任务历史)
*   **前端视觉**: HTML5 / CSS3 (Glassmorphism 拟物化设计) / Vanilla JavaScript
*   **AI/CV 引擎**: TensorFlow.js (MoveNet 模型，实现零延迟本地姿态识别)
*   **桌面外壳**: Electron (集成系统底层交互)
*   **推送系统**: 支持钉钉/企业微信 Webhook 实时分发
*   **运维自动化**: 完善的 Shell 脚本体系 (`start.sh`, `stop.sh`, `backup.sh`, `rollback.sh`)

---

## 📂 项目目录结构

```text
HealthGuardian/
├── src/main/java/...      # Spring Boot 后端源代码 (API 控制器、业务逻辑)
├── src/main/resources/
│   ├── static/            # 前端 Web 资源 (HTML, CSS, JS)
│   │   ├── js/app.js      # 核心前端逻辑与 API 通信
│   │   └── js/cv.js       # 基于 TensorFlow.js 的姿态监测模块
│   └── application.properties # 数据库及服务配置
├── electron/              # Electron 桌面端项目 (主进程逻辑、打包配置)
├── sh/                    # 运维管理脚本 (启动、停止、回滚)
└── target/                # Maven 构建产物 (可执行 JAR 包)
```

---

## 💎 核心功能

*   **生物补给协议**: 智能调节水分摄入，维持机体巅峰状态。
*   **深度专注协议**: 工业级番茄钟逻辑，记录每一秒的高效产出。
*   **AI 坐姿监测**: 接入本地摄像头，利用计算机视觉智能分析「探颈」「久坐僵直」姿态，触发实时纠正提醒。
*   **全局仪表盘**: 基于 Chart.js 的实时健康指标可视化。
*   **荣耀勋章体系**: 游戏化激励机制，让坚持变得充满荣誉感。

---

## 🚩 开发里程碑

- [x] **全能型控制台**: 整合专注、指令、监控、社交四大模块。
- [x] **PWA 极客应用**: 支持独立窗口安装，丝滑的 Web 体验。
- [x] **桌面级突破 (Electron)**: 封装为跨平台桌面 App，支持系统托盘及全局快捷键。
- [x] **AI 计算机视觉 (CV)**: 成功集成 TensorFlow.js，实现本地化坐姿识别协议。
- [x] **自定义 Neural Link**: 支持 Webhook (钉钉/企微) 消息分发。

---
> *不仅仅是一个软件，更是您通往数字巅峰的健康底座。*
