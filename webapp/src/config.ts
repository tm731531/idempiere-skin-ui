/**
 * Runtime Configuration
 *
 * 從 /ui/config.json 載入設定，允許部署後修改
 * 如果 apiBaseUrl 為空，則使用同源 API（前端跟 API 同一台）
 */

interface AppConfig {
  apiBaseUrl: string  // 空字串 = 同源，否則填完整 URL 如 "http://api-server:8080"
}

let config: AppConfig | null = null

export async function loadConfig(): Promise<AppConfig> {
  if (config) return config

  try {
    const response = await fetch('/ui/config.json')
    config = await response.json()
  } catch (e) {
    console.warn('Failed to load config.json, using defaults')
    config = { apiBaseUrl: '' }
  }

  return config!
}

export function getConfig(): AppConfig {
  if (!config) {
    throw new Error('Config not loaded. Call loadConfig() first.')
  }
  return config
}

/**
 * 取得 API Base URL
 * - 空字串：同源（/api/v1/...）
 * - 有值：跨域（http://other-server:8080/api/v1/...）
 */
export function getApiBaseUrl(): string {
  return getConfig().apiBaseUrl
}
