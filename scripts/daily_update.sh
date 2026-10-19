#!/bin/bash
# [廃止 2026-10-19] launchd の日次更新は停止済み（JS版に移行）。再開するなら plist を ~/Library/LaunchAgents に置き、web/data の .gitignore を外すこと。
# 日次更新: データ生成 → 変更があれば commit/push（GitHub Pages は push で自動デプロイされる）
set -u
cd "$(dirname "$0")/.." || exit 1
echo "=== $(date '+%F %T') 開始 ==="
.venv/bin/python -I scripts/gen_overlay.py 2>&1 | grep -E "生成|整理|スキップ|Error|Trace" 
[ "${PIPESTATUS[0]}" -eq 0 ] || { echo "データ生成に失敗"; exit 1; }
git add web/data
if git diff --cached --quiet; then
  echo "変更なし"
  exit 0
fi
git commit -q -m "データ更新 $(date +%F)"
git pull --rebase -q && git push -q && echo "push 完了"
