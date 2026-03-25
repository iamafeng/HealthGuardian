# HealthGuardian (健康守护者) 🛰️

[![GitHub Stars](https://img.shields.io/github/stars/iamafeng/HealthGuardian?style=flat-square&logo=github&color=00f2fe)](https://github.com/iamafeng/HealthGuardian)
[![GitHub Forks](https://img.shields.io/github/forks/iamafeng/HealthGuardian?style=flat-square&logo=github)](https://github.com/iamafeng/HealthGuardian)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://github.com/iamafeng/HealthGuardian/blob/main/LICENSE)
[![Release](https://img.shields.io/github/v/release/iamafeng/HealthGuardian?style=flat-square&logo=github&color=10b981&label=最新版本)](https://github.com/iamafeng/HealthGuardian/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/iamafeng/HealthGuardian/total?style=flat-square&logo=windows&color=4facfe&label=桌面版下载量)](https://github.com/iamafeng/HealthGuardian/releases/latest/download/HealthGuardian-Setup.exe)

<div align="center">

**[📥 下载 Windows 桌面版 (.exe)](https://github.com/iamafeng/HealthGuardian/releases/latest/download/HealthGuardian-Setup.exe)**　·　**[📦 所有 Releases](https://github.com/iamafeng/HealthGuardian/releases)**　·　**[🌐 在线体验](http://health.afenghu.com/)**

</div>

---

> **⚠️ 开发者备忘录 (Developer Rules)**
> **【双文档同步约束】每次新功能开发或脚本调整完成后，必须立即同步更新 `README.md` 和 `快速运行.md` 这两个核心文档，确保项目功能描述与启动/打包脚本记录时刻保持最新对齐。相关的部署与启动脚本命令仅在 `快速运行.md` 中维护。**

这是一个融合了 **Java Spring Boot 后端**、**Electron 桌面壳层**与 **TensorFlow.js 计算机视觉**的全维度健康守护平台。它不仅仅是一个提醒工具，更是一个通过 AI 技术实时监测用户状态的智能健康底座。

---

## ⬇️ 桌面版下载

| 平台 | 下载链接 | 说明 |
|---|---|---|
| 🪟 Windows 安装版 | [**HealthGuardian-Setup.exe**](https://github.com/iamafeng/HealthGuardian/releases/latest/download/HealthGuardian-Setup.exe) | NSIS 安装包，含目录选择 + 桌面快捷方式，**推荐** |
| 📦 Windows 绿色版 | [**HealthGuardian-Portable.exe**](https://github.com/iamafeng/HealthGuardian/releases/latest/download/HealthGuardian-Portable.exe) | 免安装单文件，U 盘可用 |
| 📦 历史版本 | [GitHub Releases](https://github.com/iamafeng/HealthGuardian/releases) | 所有历史版本归档 |

> **无需自己打包**，直接下载安装程序。桌面版支持系统托盘、全局快捷键 `Ctrl+Shift+H`、健康灵动岛 `Ctrl+Shift+W` 等原生功能。

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
*   **推送系统**: 支持钉钉/企业微信 Webhook 实时分发（[钉钉配置教程 →](快速运行.md)）
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
*   **🔥 连续打卡 Streak**: 追踪连续打卡天数，火焰动画激励每日坚持。
*   **🎨 四大主题皮肤**: 赛博朋克 / 自然森林 / 深海静谧 / 极简白，一键切换视觉氛围。
*   **😂 四种提醒文风**: 机甲风 / 温柔系 / 沙雕风 / 严厉风，让提醒有性格。
*   **📸 成就分享卡片**: Canvas 生成精美个人健康档案卡片，一键下载分享。
*   **🔐 统一身份同步**: 智能识别新建/登录，多端数据无缝同步。
*   **🌬️ 呼吸训练协议**: 4-7-8 科学呼吸法，膨胀/屏住/收缩动画引导 4 轮完整放松流程。
*   **📅 GitHub 热力日历**: 90 天打卡数据可视化，让坚持「看得见」。
*   **📊 健康周报生成器**: 一键生成精美 HTML 周报，含趋势对比与 AI 洞察。
*   **🎵 番茄钟环境音效**: Web Audio API 实时生成白噪音/雨声/咖啡馆三种沉浸式氛围。
*   **👁️ 眼部疲劳监测**: TF.js 实时追踪连续注视时长 + 眨眼率，超 20 分钟自动触发护眼提醒。
*   **🤖 AI 健康日报**: 每日首次打开自动弹出日报，包含 streak、昨日复盘、最活跃时段、智能激励文案。
*   **👫 健康搭子**: 用户名邀请码绑定好友，实时查看搭子今日打卡数据，互相监督。
*   **⚡ 智能提醒自适应**: 分析个人历史打卡间隔，自动推荐最优提醒频率，一键应用。
*   **🧠 心流动态音频**: CV 实时感知专注度（坐姿稳定 + 眨眼规律），自动调节白噪音音量并叠加 10 Hz Alpha 脑波节律，深度心流时轻轻混入双耳节拍。
*   **📅 日程结束提醒**: 设置会议结束时间，到时自动弹出拉伸引导，消除长会后的久坐伤害。

---

## 🚩 开发里程碑

- [x] **全能型控制台**: 整合专注、指令、监控、社交四大模块。
- [x] **PWA 极客应用**: 支持独立窗口安装，丝滑的 Web 体验。
- [x] **桌面级突破 (Electron)**: 封装为跨平台桌面 App，支持系统托盘及全局快捷键。
- [x] **AI 计算机视觉 (CV)**: 成功集成 TensorFlow.js，实现本地化坐姿识别协议。
- [x] **自定义 Neural Link**: 支持 Webhook (钉钉/企微) 消息分发。
- [x] **V3.5 — 统一认证 & 访客隔离**: 多端账号同步修复，访客不再写 t_user 表。
- [x] **V3.5 — 连续打卡 Streak**: 火焰动画 + 后端连续天数计算引擎。
- [x] **V3.5 — 四大主题 & 四种文风**: 完全可定制的视觉与交互个性化系统。
- [x] **V3.5 — 成就分享卡片**: Canvas 渲染精美分享图，一键下载。
- [x] **V3.5 — 呼吸训练协议**: 4-7-8 呼吸法，三阶段动画引导 + 4 轮计时。
- [x] **V3.5 — 健康热力日历**: GitHub 风格 90 天打卡热力图。
- [x] **V3.5 — 健康周报生成器**: 本周 vs 上周趋势对比 + AI 洞察文案。
- [x] **V3.5 — 专注环境音效**: Web Audio API 零依赖生成三种氛围白噪音。
- [x] **V3.5 — 眼部疲劳监测**: TF.js 扩展追踪注视时长 + 眨眼率，自动触发护眼序列。
- [x] **V3.5 — AI 健康日报**: 模板化日报引擎，每日首次访问自动弹出，数据驱动激励文案。
- [x] **V3.5 — 健康搭子系统**: t_partner 表 @PostConstruct 自动建表，用户名邀请码绑定/解绑，实时搭子状态展示。
- [x] **V3.5 — 智能提醒自适应**: MySQL 8 窗口函数分析历史打卡间隔，推荐最优频率，一键应用。
- [x] **V4.0 — 健康小怪兽 (Pet)**: 侧边栏常驻「小健子」宠物，打卡活力动态更新（🥚→🤩），坏坐姿联动🤒。
- [x] **V4.0 — 搭子电击提醒**: 搭子卡片一键「⚡ 提醒」，通过 Webhook 向对方发送督促消息。
- [x] **V4.0 — 隐藏成就彩蛋**: 4 个神秘成就（午夜幽灵/补水冠军/黎明战士/宠物达人），解锁时动画弹出。
- [x] **V4.0 — Electron 同步增强**: 托盘菜单新增「账号同步」和「赏作者咖啡」入口，桌面端自动显示跨端同步引导条。
- [x] **V4.0 — 多主题兼容**: 新增 forest/ocean 专项 CSS 覆盖规则，全主题弹窗/输入框/按钮完美渲染。
- [x] **V4.0 — 🏝️ 健康灵动岛**: Electron 悬浮窗（`Ctrl+Shift+W`），实时显示 Streak、番茄钟倒计时（localStorage 桥接）、CV 坐姿状态（探颈时变红），双击呼出主窗口。
- [x] **V4.0 — 🌦️ 环境感知 (P5)**: Open-Meteo 免费天气 API + Geolocation，主面板天气栏显示温度/天气/提示；雨天自动切换雨声氛围音；天气数据同步至灵动岛 widget。
- [x] **V4.1 — 🧠 心流动态音频 (P3)**: 🧠 心流 按钮激活后，CV 实时计算专注度得分（坐姿 + 眨眼率），每 2 s 通过 Web Audio `setTargetAtTime` 平滑调节白噪音音量，并叠加 200/210 Hz 双耳 Alpha 脑波节律（10 Hz 差频）。专注时 Alpha 增强，分散时减弱。
- [x] **V4.1 — 📅 日程结束提醒 (P5)**: 用户设置会议结束时间，到时自动弹出 desk 拉伸序列 + DingTalk Webhook 推送；localStorage 持久化，跨刷新恢复倒计时。
- [x] **V4.1 — 🔒 配置外置与脱敏**: 彻底解耦生产环境数据库配置，支持通过环境变量与外部 `config/application.properties` 加载真实配置，保障代码仓库安全。
- [x] **V4.2 — 🌟 浮动数字桌宠 (Standalone Floating Pet)**: 全局存在的浮动交互式健康小精灵，支持悬停表情变化、点击跳跃对话，以及过度戳弄发脾气的多维情绪系统。

---
> *不仅仅是一个软件，更是您通往数字巅峰的健康底座。*

---

## 🤖 钉钉机器人配置（3 分钟快速上手）

> 详细图文教程见 [快速运行.md → 第 5 节](快速运行.md)

1. 打开钉钉群 → **群设置** → **智能群助手** → **添加机器人** → 选择 **自定义**
2. 安全设置选 **自定义关键词**，填写以下关键词（必填，否则消息被拦截）：

   ```
   Health    提醒    告警    激励    专注
   ```

3. 点击完成，复制 Webhook 地址（格式：`https://oapi.dingtalk.com/robot/send?access_token=xxx`）
4. 粘贴到 HealthGuardian → **🔔 推送与通知** → 保存即可

> 💡 企业微信机器人同样支持，直接替换 Webhook 地址，无需任何代码改动。

---

## ☕ 支持作者 (Buy Me a Coffee)

如果这个项目对你有帮助，欢迎打赏支持，让我保持持续创作的动力！

<div align="center">
<table>
<tr>
<td align="center">
<img src="src/main/resources/static/qrCode/weixinpay.png" width="160" height="160" alt="微信打赏" /><br/>
🟢 微信支付
</td>
<td align="center">
<img src="src/main/resources/static/qrCode/alipay.png" width="160" height="160" alt="支付宝打赏" /><br/>
🔵 支付宝
</td>
</tr>
</table>
</div>

也欢迎给项目点个 ⭐ Star，这也是对作者最大的鼓励！

👉 **[https://github.com/iamafeng/HealthGuardian](https://github.com/iamafeng/HealthGuardian)**


