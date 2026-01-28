#!/bin/bash
# 检查 specs/ 中所有文档引用是否有效
find specs -name "*.md" -exec grep -l "docs/" {} \; | while read file; do
  grep -o "docs/[^)]*" " $ file" | while read link; do
    [ ! -f " $ link" ] && echo "❌ 失效链接:  $ file →  $ link"
  done
done