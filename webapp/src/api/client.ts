import axios from 'axios'

// 建立 axios instance
export const apiClient = axios.create({
  // 開發時由 vite proxy 處理，生產時直接呼叫同 origin
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Token 已在 auth store 中設定
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // 401 未授權 - 跳轉登入
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/ui/login'
    }
    return Promise.reject(error)
  }
)

// API 方法封裝
export const api = {
  // 通用 Model 操作
  async getRecords(model: string, params?: Record<string, unknown>) {
    const response = await apiClient.get(`/api/v1/models/${model}`, { params })
    return response.data
  },

  async getRecord(model: string, id: number) {
    const response = await apiClient.get(`/api/v1/models/${model}/${id}`)
    return response.data
  },

  async createRecord(model: string, data: Record<string, unknown>) {
    const response = await apiClient.post(`/api/v1/models/${model}`, data)
    return response.data
  },

  async updateRecord(model: string, id: number, data: Record<string, unknown>) {
    const response = await apiClient.put(`/api/v1/models/${model}/${id}`, data)
    return response.data
  },

  async deleteRecord(model: string, id: number) {
    const response = await apiClient.delete(`/api/v1/models/${model}/${id}`)
    return response.data
  },

  // 業務特定 API
  async getProducts(categoryId?: number) {
    const params: Record<string, string> = {}
    if (categoryId) {
      params['$filter'] = `M_Product_Category_ID eq ${categoryId}`
    }
    return this.getRecords('M_Product', params)
  },

  async getPatients() {
    return this.getRecords('C_BPartner', {
      '$filter': 'C_BP_Group_ID eq 1000004', // Patient group
    })
  },

  async getVendors() {
    return this.getRecords('C_BPartner', {
      '$filter': 'IsVendor eq true',
    })
  },

  async getWarehouses() {
    return this.getRecords('M_Warehouse')
  },

  async getStorageOnHand(warehouseId?: number, productId?: number) {
    const filters: string[] = []
    if (warehouseId) filters.push(`M_Warehouse_ID eq ${warehouseId}`)
    if (productId) filters.push(`M_Product_ID eq ${productId}`)

    const params: Record<string, string> = {}
    if (filters.length) {
      params['$filter'] = filters.join(' and ')
    }
    return this.getRecords('M_StorageOnHand', params)
  },
}

export default api
