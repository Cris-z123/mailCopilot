# mailCopilot

> 智能邮件处理助手 - Email Item Traceability & Verification System

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/your-org/mailcopilot)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-29.4.6-9FEAF5?logo=electron)](https://electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://reactjs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.2.4-6E9F18?logo=vitest)](https://vitest.dev/)

## 📖 项目简介

mailCopilot 是一款面向隐私敏感场景的**本地邮件智能处理客户端**，通过规则引擎与本地/远程 LLM 协同，在**用户可控环境**下实现邮件内容结构化、事项提取、**自动生成用户日报**（包含完成事项、待办事项、当日情况总结）。

### 核心特性

- ✅ **100% 事项可溯源** - 每个事项均可追溯到原始邮件来源
- 🔒 **隐私优先架构** - 字段级 AES-256-GCM 加密，WAL 模式保证数据安全
- 🎯 **智能置信度系统** - 基于规则引擎和 LLM 的双引擎置信度计算
- 🔍 **多格式支持** - 支持主流邮件格式（EML, MBOX, PST）
- 🌓 **双模式运行** - 本地模式/远程模式热切换
- 💾 **设备绑定存储** - SQLite 本地数据库，零知识架构
- 📊 **日报生成** - 自动生成包含事项、进度、总结的日报
- 🔄 **IPC 通信** - Electron IPC 处理管道，安全的主进程通信

## 🚀 快速开始

### 环境要求

- **Node.js**: 20.x (LTS)
- **npm**: 10.x 或 pnpm 8.x
- **操作系统**: Windows 10+, macOS 11+, Linux

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/your-org/mailcopilot.git
cd mailcopilot

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run build

# 运行生产版本
npm run start
```

### 本地模式要求（可选）

如果使用本地模式，需要先安装 Ollama

## 🏗️ 技术栈

### 核心框架
- **Electron** 29.4.6 - 跨平台桌面应用框架
- **React** 18 - 用户界面
- **TypeScript** 5.4 - 类型安全
- **Zustand** 4.5 - 状态管理

## 🔧 开发指南

### 开发命令

```bash
# 启动开发服务器（热重载）
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 自动修复代码风格
npm run lint:fix

# 格式化代码
npm run format
```

### 测试命令

```bash
# 运行所有测试
npm test

# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# 安全测试
npm run test:security

# 代码覆盖率
npm run test:coverage
```

## 📖 文档

- [技术架构文档](./docs/tech-architecture.md) - 完整的技术设计说明
- [功能规格](./specs/001-email-item-traceability/spec.md) - 详细功能需求

## 🔒 安全与隐私

### 设计原则

1. **隐私优先**: 默认远程模式，完全离线可选
2. **零知识架构**: 不提供云备份，无跨设备同步
3. **防幻觉机制**: 100% 事项可溯源，无来源事项降级入库
4. **设备绑定**: 数据绑定当前设备，重装系统即数据丢失

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [Electron](https://electronjs.org/) - 跨平台桌面应用框架
- [React](https://reactjs.org/) - 用户界面库
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite 同步驱动
- [Zustand](https://github.com/pmndrs/zustand) - 状态管理
- [Vite](https://vitejs.dev/) - 下一代前端构建工具

## 📮 联系方式
- 问题反馈: [GitHub Issues](https://github.com/your-org/mailcopilot/issues)

---
