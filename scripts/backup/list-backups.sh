#!/bin/bash
#
# 列出所有備份
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"

echo "========================================"
echo "  iDempiere 備份列表"
echo "========================================"
echo ""

if [ ! -d "$BACKUP_DIR" ]; then
  echo "尚無備份"
  exit 0
fi

for dir in "$BACKUP_DIR"/*/; do
  if [ -d "$dir" ]; then
    DIRNAME=$(basename "$dir")
    INFO_FILE="$dir/backup_info.json"

    if [ -f "$INFO_FILE" ]; then
      DATE=$(cat "$INFO_FILE" | grep -o '"date":"[^"]*"' | cut -d'"' -f4)
      echo "📁 $DIRNAME"
      echo "   日期: $DATE"
      echo "   檔案:"
      ls "$dir"/*.json 2>/dev/null | while read f; do
        SIZE=$(ls -lh "$f" | awk '{print $5}')
        NAME=$(basename "$f")
        echo "      - $NAME ($SIZE)"
      done
      echo ""
    fi
  fi
done
