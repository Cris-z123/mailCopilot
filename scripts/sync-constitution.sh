#!/bin/bash
# 从技术架构文档提取关键约束到 constitution
echo "🔄 同步技术约束到 memory/constitution.md..."
{
  echo "# 项目宪法 (自动生成)"
  echo "## 核心约束"
  grep -A 20 "## 技术约束" docs/tech-architecture.md | tail -n +2
  echo -e "\n## 维护说明"
  echo "- 本文件由 scripts/sync-constitution.sh 自动生成"
  echo "- 修改约束请编辑 docs/tech-architecture.md"
} > memory/constitution.md
echo "✅ 同步完成！请提交 memory/constitution.md"