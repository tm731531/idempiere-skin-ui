<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { checkNhiService, readNhiCard, type NhiCard } from '@/api/nhi'

const router = useRouter()

const serviceOnline = ref<boolean | null>(null)
const isChecking = ref(false)

// Test read
const testCard = ref<NhiCard | null>(null)
const testError = ref<string | null>(null)
const isTestReading = ref(false)

// Platform tab
const platform = ref<'windows' | 'linux'>('windows')

const DOWNLOAD_BASE = 'https://github.com/magiclen/tw-nhi-icc-service/releases/download/v0.2.3'

onMounted(async () => {
  await checkService()
})

async function checkService() {
  isChecking.value = true
  serviceOnline.value = null
  try {
    serviceOnline.value = await checkNhiService()
  } finally {
    isChecking.value = false
  }
}

async function testRead() {
  isTestReading.value = true
  testCard.value = null
  testError.value = null
  try {
    testCard.value = await readNhiCard()
  } catch (e: any) {
    testError.value = e.message || '讀取失敗'
  } finally {
    isTestReading.value = false
  }
}
</script>

<template>
  <div class="nhi-setup">
    <div class="page-header">
      <button class="btn-back" @click="router.push('/')">← 返回</button>
      <h2>健保讀卡設定</h2>
    </div>
    <p class="hint">設定健保 IC 卡讀卡機，讓掛號時可以自動讀取病患資料</p>

    <!-- Service Status -->
    <div class="section">
      <h3>服務狀態</h3>
      <div class="status-row">
        <span v-if="isChecking" class="status-indicator checking">檢查中...</span>
        <span v-else-if="serviceOnline === true" class="status-indicator online">已連線</span>
        <span v-else-if="serviceOnline === false" class="status-indicator offline">未連線</span>
        <span v-else class="status-indicator">未知</span>
        <button class="btn btn-sm" @click="checkService" :disabled="isChecking">重新檢查</button>
      </div>
      <p v-if="serviceOnline === false" class="status-hint">
        請確認已安裝並啟動讀卡服務（見下方安裝說明）
      </p>
    </div>

    <!-- Test Read -->
    <div class="section">
      <h3>測試讀卡</h3>
      <button class="btn btn-primary" @click="testRead" :disabled="isTestReading">
        {{ isTestReading ? '讀取中...' : '測試讀取健保卡' }}
      </button>
      <div v-if="testCard" class="test-result success">
        <div class="test-row"><label>姓名</label><span>{{ testCard.fullName }}</span></div>
        <div class="test-row"><label>身分證</label><span>{{ testCard.idNo }}</span></div>
        <div class="test-row"><label>生日</label><span>{{ testCard.birthDate }}</span></div>
        <div class="test-row"><label>性別</label><span>{{ testCard.sex === 'M' ? '男' : '女' }}</span></div>
        <div class="test-row"><label>卡號</label><span>{{ testCard.cardNo }}</span></div>
        <div class="test-row"><label>發卡日</label><span>{{ testCard.issueDate }}</span></div>
        <div v-if="testCard.readerName" class="test-row"><label>讀卡機</label><span>{{ testCard.readerName }}</span></div>
      </div>
      <div v-if="testError" class="test-result error">{{ testError }}</div>
    </div>

    <!-- Download -->
    <div class="section">
      <h3>下載讀卡服務</h3>
      <p class="section-desc">
        需要在每台有讀卡機的電腦上安裝
        <a href="https://github.com/magiclen/tw-nhi-icc-service" target="_blank" rel="noopener">tw-nhi-icc-service</a>
      </p>
      <div class="download-list">
        <a class="download-item" :href="`${DOWNLOAD_BASE}/tw-nhi-icc-service-windows-x86_64.exe`" target="_blank">
          <div class="dl-icon">&#x1F4BB;</div>
          <div class="dl-info">
            <div class="dl-name">Windows 64 位元</div>
            <div class="dl-size">3.5 MB</div>
          </div>
        </a>
        <a class="download-item" :href="`${DOWNLOAD_BASE}/tw-nhi-icc-service-windows-x86.exe`" target="_blank">
          <div class="dl-icon">&#x1F4BB;</div>
          <div class="dl-info">
            <div class="dl-name">Windows 32 位元</div>
            <div class="dl-size">3.2 MB</div>
          </div>
        </a>
        <a class="download-item" :href="`${DOWNLOAD_BASE}/tw-nhi-icc-service-linux-x86_64`" target="_blank">
          <div class="dl-icon">&#x1F427;</div>
          <div class="dl-info">
            <div class="dl-name">Linux x86_64</div>
            <div class="dl-size">4.0 MB</div>
          </div>
        </a>
      </div>
    </div>

    <!-- Installation Instructions -->
    <div class="section">
      <h3>安裝說明</h3>
      <div class="platform-tabs">
        <button :class="['tab', { active: platform === 'windows' }]" @click="platform = 'windows'">Windows</button>
        <button :class="['tab', { active: platform === 'linux' }]" @click="platform = 'linux'">Linux</button>
      </div>

      <div v-if="platform === 'windows'" class="instructions">
        <ol>
          <li>下載上方 <strong>Windows 64 位元</strong>（或 32 位元）版本</li>
          <li>將檔案放到任意目錄（例如 <code>C:\nhi-reader\</code>）</li>
          <li>接上讀卡機（EZ-100PU 或其他 PC/SC 相容讀卡機）</li>
          <li>雙擊執行 <code>tw-nhi-icc-service-windows-x86_64.exe</code></li>
          <li>命令列視窗出現 <code>Listening on 127.0.0.1:8000</code> 表示成功</li>
          <li>保持視窗開啟，回到本系統即可使用讀卡功能</li>
        </ol>
        <div class="tip">
          <strong>提示：</strong>如需開機自動啟動，可將執行檔的捷徑放入「啟動」資料夾
          （<code>Win+R</code> 輸入 <code>shell:startup</code>）
        </div>
      </div>

      <div v-if="platform === 'linux'" class="instructions">
        <ol>
          <li>下載上方 <strong>Linux x86_64</strong> 版本</li>
          <li>設定執行權限：<code>chmod +x tw-nhi-icc-service-linux-x86_64</code></li>
          <li>安裝 PC/SC 驅動：
            <code>sudo apt install pcscd libpcsclite-dev</code>
          </li>
          <li>啟動 PC/SC 服務：
            <code>sudo systemctl start pcscd</code>
          </li>
          <li>接上讀卡機</li>
          <li>執行：<code>./tw-nhi-icc-service-linux-x86_64</code></li>
          <li>看到 <code>Listening on 127.0.0.1:8000</code> 表示成功</li>
        </ol>
        <div class="tip">
          <strong>提示：</strong>如需開機自動啟動，可建立 systemd service 或加入 <code>rc.local</code>
        </div>
      </div>
    </div>

    <!-- Supported Readers -->
    <div class="section">
      <h3>支援的讀卡機</h3>
      <p class="section-desc">任何支援 PC/SC 標準的 IC 卡讀卡機皆可使用，例如：</p>
      <ul class="reader-list">
        <li>EZ-100PU（虹堡科技）</li>
        <li>ACR38U / ACR39U（ACS）</li>
        <li>其他 CCID 相容讀卡機</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.nhi-setup { max-width: 600px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem; }
.page-header h2 { font-size: 1.25rem; margin: 0; }
.btn-back { background: none; border: none; font-size: 1rem; color: #795548; cursor: pointer; padding: 0.25rem; }
.hint { font-size: 0.875rem; color: #999; margin-bottom: 1rem; }

.section { background: white; border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; }
.section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }
.section-desc { font-size: 0.875rem; color: #666; margin: 0 0 0.75rem 0; }
.section-desc a { color: #795548; }

/* Status */
.status-row { display: flex; align-items: center; gap: 0.75rem; }
.status-indicator { padding: 0.375rem 0.75rem; border-radius: 1rem; font-size: 0.875rem; font-weight: 500; }
.status-indicator.online { background: #e8f5e9; color: #2e7d32; }
.status-indicator.offline { background: #ffebee; color: #c62828; }
.status-indicator.checking { background: #fff3e0; color: #e65100; }
.status-hint { font-size: 0.75rem; color: #999; margin-top: 0.5rem; }

/* Test */
.test-result { margin-top: 0.75rem; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; }
.test-result.success { background: #e8f5e9; }
.test-result.error { background: #ffebee; color: #c62828; }
.test-row { display: flex; gap: 0.5rem; padding: 0.25rem 0; }
.test-row label { min-width: 4rem; color: #666; font-weight: 500; }

/* Download */
.download-list { display: flex; flex-direction: column; gap: 0.5rem; }
.download-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 0.5rem; text-decoration: none; color: inherit; cursor: pointer; }
.download-item:hover { background: #f5f5f5; border-color: #795548; }
.dl-icon { font-size: 1.5rem; }
.dl-info { flex: 1; }
.dl-name { font-weight: 500; }
.dl-size { font-size: 0.75rem; color: #999; }

/* Platform tabs */
.platform-tabs { display: flex; gap: 0; margin-bottom: 0.75rem; border: 1px solid #ddd; border-radius: 0.5rem; overflow: hidden; }
.tab { flex: 1; padding: 0.5rem; border: none; background: white; font-size: 0.875rem; cursor: pointer; }
.tab.active { background: #795548; color: white; }

/* Instructions */
.instructions ol { margin: 0; padding-left: 1.25rem; font-size: 0.875rem; line-height: 1.8; }
.instructions code { background: #f5f5f5; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.8125rem; }
.tip { margin-top: 0.75rem; padding: 0.75rem; background: #fff3e0; border-radius: 0.375rem; font-size: 0.8125rem; color: #795548; }

/* Readers */
.reader-list { margin: 0; padding-left: 1.25rem; font-size: 0.875rem; line-height: 1.6; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-primary { background: #795548; color: white; border-color: #795548; }
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; min-height: auto; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
