#!/bin/bash
#
# 比較備份與目前資料的差異
#
# 使用方式：
#   ./compare.sh <backup_folder> <table_name>
#
# 範例：
#   ./compare.sh ./backups/20260206_143000 M_Product
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.env"

BACKUP_PATH="$1"
TABLE="$2"

if [ -z "$BACKUP_PATH" ] || [ -z "$TABLE" ]; then
  echo "用法: $0 <backup_folder> <table_name>"
  echo ""
  echo "可用的表格："
  echo "  M_Product, C_BPartner, M_StorageOnHand, C_Order, ..."
  exit 1
fi

BACKUP_FILE="$BACKUP_PATH/${TABLE}.json"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ 找不到備份檔: $BACKUP_FILE"
  exit 1
fi

echo "========================================"
echo "  比較: $TABLE"
echo "  備份: $BACKUP_PATH"
echo "========================================"
echo ""

# 登入
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/tokens" \
  -H "Content-Type: application/json" \
  -d "{\"userName\":\"$API_USER\",\"password\":\"$API_PASS\"}")
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

CONTEXT_RESPONSE=$(curl -s -X PUT "$API_URL/api/v1/auth/tokens" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":$CLIENT_ID,\"roleId\":$ROLE_ID,\"organizationId\":$ORG_ID,\"warehouseId\":$WAREHOUSE_ID}")
TOKEN2=$(echo "$CONTEXT_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 取得目前資料
echo "取得目前資料..."
CURRENT=$(curl -s -X GET "$API_URL/api/v1/models/$TABLE" \
  -H "Authorization: Bearer $TOKEN2")

# 儲存目前資料
CURRENT_FILE="/tmp/current_${TABLE}.json"
echo "$CURRENT" > "$CURRENT_FILE"

# 比較筆數
BACKUP_COUNT=$(cat "$BACKUP_FILE" | grep -o '"row-count":[0-9]*' | cut -d':' -f2)
CURRENT_COUNT=$(echo "$CURRENT" | grep -o '"row-count":[0-9]*' | cut -d':' -f2)

echo ""
echo "=== 筆數比較 ==="
echo "備份時: $BACKUP_COUNT 筆"
echo "目前:   $CURRENT_COUNT 筆"
echo "差異:   $((CURRENT_COUNT - BACKUP_COUNT)) 筆"
echo ""

# 如果有 jq 可以做更詳細的比較
if command -v jq &> /dev/null; then
  echo "=== 詳細差異（使用 jq）==="
  echo ""

  # 取得備份的 ID 列表
  BACKUP_IDS=$(cat "$BACKUP_FILE" | jq -r '.records[].id' | sort)
  CURRENT_IDS=$(echo "$CURRENT" | jq -r '.records[].id' | sort)

  # 找出新增的
  echo "新增的記錄 ID："
  comm -13 <(echo "$BACKUP_IDS") <(echo "$CURRENT_IDS") | head -10

  echo ""
  echo "刪除的記錄 ID："
  comm -23 <(echo "$BACKUP_IDS") <(echo "$CURRENT_IDS") | head -10
else
  echo "（安裝 jq 可以看到更詳細的差異）"
fi

echo ""
echo "========================================"
echo "  完整資料已儲存到: $CURRENT_FILE"
echo "========================================"
