<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')

// Navigate to home when login completes
watch(() => authStore.loginStep, (step) => {
  if (step === 'done') {
    const redirect = route.query.redirect as string || '/'
    router.push(redirect)
  }
})

async function handleLogin() {
  if (!username.value || !password.value) {
    authStore.loginError = '請輸入帳號密碼'
    return
  }
  await authStore.authenticate(username.value, password.value)
}

function selectClient(clientId: number) {
  authStore.selectClient(clientId)
}

function selectRole(roleId: number) {
  authStore.selectRole(roleId)
}

function selectOrg(orgId: number) {
  authStore.selectOrg(orgId)
}

function selectWarehouse(warehouseId: number) {
  authStore.selectWarehouse(warehouseId)
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h1 class="login-title">醫療診所系統</h1>

      <!-- Step: Credentials -->
      <template v-if="authStore.loginStep === 'credentials'">
        <p class="login-subtitle">請登入您的帳號</p>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label for="username">帳號</label>
            <input
              id="username"
              v-model="username"
              type="text"
              placeholder="請輸入帳號"
              autocomplete="username"
              :disabled="authStore.loginLoading"
            />
          </div>

          <div class="form-group">
            <label for="password">密碼</label>
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="請輸入密碼"
              autocomplete="current-password"
              :disabled="authStore.loginLoading"
            />
          </div>

          <div v-if="authStore.loginError" class="error-message">
            {{ authStore.loginError }}
          </div>

          <button type="submit" class="login-button" :disabled="authStore.loginLoading">
            {{ authStore.loginLoading ? '登入中...' : '登入' }}
          </button>
        </form>
      </template>

      <!-- Step: Select Client -->
      <template v-else-if="authStore.loginStep === 'client'">
        <p class="login-subtitle">請選擇公司</p>

        <div class="selection-list">
          <button
            v-for="client in authStore.availableClients"
            :key="client.id"
            class="selection-button"
            :disabled="authStore.loginLoading"
            @click="selectClient(client.id)"
          >
            {{ client.name }}
          </button>
        </div>

        <div v-if="authStore.loginError" class="error-message">
          {{ authStore.loginError }}
        </div>

        <button class="back-button" @click="authStore.loginGoBack()" :disabled="authStore.loginLoading">
          ← 上一步
        </button>
      </template>

      <!-- Step: Select Role -->
      <template v-else-if="authStore.loginStep === 'role'">
        <p class="login-subtitle">請選擇角色</p>

        <div class="selection-list">
          <button
            v-for="role in authStore.availableRoles"
            :key="role.id"
            class="selection-button"
            :disabled="authStore.loginLoading"
            @click="selectRole(role.id)"
          >
            {{ role.name }}
          </button>
        </div>

        <div v-if="authStore.loginError" class="error-message">
          {{ authStore.loginError }}
        </div>

        <button class="back-button" @click="authStore.loginGoBack()" :disabled="authStore.loginLoading">
          ← 上一步
        </button>
      </template>

      <!-- Step: Select Organization -->
      <template v-else-if="authStore.loginStep === 'org'">
        <p class="login-subtitle">請選擇組織</p>

        <div class="selection-list">
          <button
            v-for="org in authStore.availableOrgs"
            :key="org.id"
            class="selection-button"
            :disabled="authStore.loginLoading"
            @click="selectOrg(org.id)"
          >
            {{ org.name }}
          </button>
        </div>

        <div v-if="authStore.loginError" class="error-message">
          {{ authStore.loginError }}
        </div>

        <button class="back-button" @click="authStore.loginGoBack()" :disabled="authStore.loginLoading">
          ← 上一步
        </button>
      </template>

      <!-- Step: Select Warehouse -->
      <template v-else-if="authStore.loginStep === 'warehouse'">
        <p class="login-subtitle">請選擇倉庫</p>

        <div class="selection-list">
          <button
            v-for="wh in authStore.availableWarehouses"
            :key="wh.id"
            class="selection-button"
            :disabled="authStore.loginLoading"
            @click="selectWarehouse(wh.id)"
          >
            {{ wh.name }}
          </button>
        </div>

        <div v-if="authStore.loginError" class="error-message">
          {{ authStore.loginError }}
        </div>

        <button class="back-button" @click="authStore.loginGoBack()" :disabled="authStore.loginLoading">
          ← 上一步
        </button>
      </template>

      <!-- Loading spinner overlay -->
      <div v-if="authStore.loginLoading && authStore.loginStep !== 'credentials'" class="loading-overlay">
        載入中...
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
}

.login-card {
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  position: relative;
}

.login-title {
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 0.5rem;
  color: #333;
}

.login-subtitle {
  text-align: center;
  color: #666;
  margin-bottom: 1.5rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 500;
  color: #333;
}

.form-group input {
  padding: 0.875rem 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.form-group input:disabled {
  background: #f5f5f5;
}

.error-message {
  color: #e53e3e;
  font-size: 0.875rem;
  text-align: center;
  padding: 0.5rem;
  background: #fed7d7;
  border-radius: 0.25rem;
  margin-top: 0.5rem;
}

.login-button {
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  min-height: 48px;
}

.login-button:hover:not(:disabled) {
  opacity: 0.9;
}

.login-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Selection list for client/role/org/warehouse */
.selection-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.selection-button {
  padding: 1rem 1.25rem;
  background: #f7f8fc;
  border: 2px solid #e2e5f1;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  min-height: 56px;
  display: flex;
  align-items: center;
}

.selection-button:hover:not(:disabled) {
  border-color: #667eea;
  background: #eef0fb;
}

.selection-button:active:not(:disabled) {
  background: #dde1f7;
}

.selection-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.back-button {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  color: #667eea;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  width: 100%;
}

.back-button:hover:not(:disabled) {
  text-decoration: underline;
}

.back-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 1rem;
  font-size: 1rem;
  color: #667eea;
  font-weight: 500;
}
</style>
