#!/bin/bash
#
# iDempiere 庫存還原腳本
# 用途：將庫存數量還原到備份時的狀態
#
# 使用方式：
#   ./restore-inventory.sh <backup_folder>
#
# 範例：
#   ./restore-inventory.sh ./backups/20260206_143000
#

set -e

# 載入設定
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.env"

# 檢查參數
if [ -z "$1" ]; then
  echo "用法: $0 <backup_folder>"
  echo ""
  echo "可用的備份："
  ls -la "$SCRIPT_DIR/backups/" 2>/dev/null || echo "（無備份）"
  exit 1
fi

BACKUP_PATH="$1"

if [ ! -d "$BACKUP_PATH" ]; then
  echo "❌ 備份目錄不存在: $BACKUP_PATH"
  exit 1
fi

if [ ! -f "$BACKUP_PATH/M_StorageOnHand.json" ]; then
  echo "❌ 找不到庫存備份檔: $BACKUP_PATH/M_StorageOnHand.json"
  exit 1
fi

echo "========================================"
echo "  iDempiere 庫存還原"
echo "  時間: $(date)"
echo "  備份: $BACKUP_PATH"
echo "========================================"

# 登入
echo ""
echo "[1/3] 登入 API..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/tokens" \
  -H "Content-Type: application/json" \
  -d "{\"userName\":\"$API_USER\",\"password\":\"$API_PASS\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登入失敗"
  exit 1
fi
echo "✅ 登入成功"

# 設定 Context
echo ""
echo "[2/3] 設定 Context..."
CONTEXT_RESPONSE=$(curl -s -X PUT "$API_URL/api/v1/auth/tokens" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":$CLIENT_ID,\"roleId\":$ROLE_ID,\"organizationId\":$ORG_ID,\"warehouseId\":$WAREHOUSE_ID}")

TOKEN2=$(echo "$CONTEXT_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN2" ]; then
  echo "❌ 設定 Context 失敗"
  exit 1
fi
echo "✅ Context 設定成功"

# 還原庫存
echo ""
echo "[3/3] 還原庫存..."
echo ""
echo "⚠️  警告：此操作會修改 M_StorageOnHand 資料"
echo "   備份時間: $(cat "$BACKUP_PATH/backup_info.json" | grep -o '"date":"[^"]*"' | cut -d'"' -f4)"
echo ""
read -p "確定要繼續嗎？(y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "取消還原"
  exit 0
fi

# 注意：M_StorageOnHand 通常不能直接透過 API 更新
# 這裡提供的是比對報告，實際還原可能需要透過 Inventory 單據

echo ""
echo "=== 庫存差異報告 ==="
echo ""

# 取得目前庫存
CURRENT=$(curl -s -X GET "$API_URL/api/v1/models/M_StorageOnHand" \
  -H "Authorization: Bearer $TOKEN2")

echo "備份庫存 vs 目前庫存："
echo ""
echo "此功能需要進一步實作..."
echo "建議方式："
echo "  1. 透過 M_Inventory（盤點單）調整庫存"
echo "  2. 或聯繫 DBA 直接處理資料庫"
echo ""

# 產生差異報告
cat > "$BACKUP_PATH/restore_report_$(date +%Y%m%d_%H%M%S).txt" << EOF
庫存還原報告
============

還原時間: $(date)
備份來源: $BACKUP_PATH

注意：由於 iDempiere 的庫存是透過交易計算的，
無法直接透過 API 修改 M_StorageOnHand。

建議還原方式：
1. 建立盤點單（M_Inventory）調整差異
2. 或請 DBA 直接操作資料庫

備份的庫存資料保存在：
$BACKUP_PATH/M_StorageOnHand.json
EOF

echo "報告已儲存"
echo ""
echo "========================================"
echo "  還原報告完成"
echo "========================================"
