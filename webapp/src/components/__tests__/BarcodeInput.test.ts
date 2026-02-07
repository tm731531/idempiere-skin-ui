/**
 * BarcodeInput Component Unit Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BarcodeInput from '../BarcodeInput.vue'

// Mock CameraScannerModal to avoid html5-qrcode dependency in tests
vi.mock('../CameraScannerModal.vue', () => ({
  default: {
    name: 'CameraScannerModal',
    template: '<div class="mock-scanner" />',
    emits: ['scan', 'close'],
  },
}))

const mountOptions = {
  global: { stubs: { Teleport: true } },
}

describe('BarcodeInput', () => {
  it('renders with default placeholder', () => {
    const wrapper = mount(BarcodeInput, mountOptions)
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toContain('掃描條碼')
  })

  it('renders with custom placeholder', () => {
    const wrapper = mount(BarcodeInput, {
      ...mountOptions,
      props: { placeholder: 'Custom text' },
    })
    expect(wrapper.find('input').attributes('placeholder')).toBe('Custom text')
  })

  it('shows camera button by default', () => {
    const wrapper = mount(BarcodeInput, mountOptions)
    expect(wrapper.find('.camera-btn').exists()).toBe(true)
  })

  it('hides camera button when showCameraButton is false', () => {
    const wrapper = mount(BarcodeInput, {
      ...mountOptions,
      props: { showCameraButton: false },
    })
    expect(wrapper.find('.camera-btn').exists()).toBe(false)
  })

  it('emits scan event on Enter key with value', async () => {
    const wrapper = mount(BarcodeInput, mountOptions)
    const input = wrapper.find('input')

    await input.setValue('ABC123')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('scan')).toBeTruthy()
    expect(wrapper.emitted('scan')![0]).toEqual(['ABC123'])
  })

  it('does not emit scan on Enter with empty value', async () => {
    const wrapper = mount(BarcodeInput, mountOptions)
    const input = wrapper.find('input')

    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('scan')).toBeFalsy()
  })

  it('clears input after successful scan', async () => {
    const wrapper = mount(BarcodeInput, mountOptions)
    const input = wrapper.find('input')

    await input.setValue('BARCODE456')
    await input.trigger('keydown', { key: 'Enter' })

    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('trims whitespace from scanned value', async () => {
    const wrapper = mount(BarcodeInput, mountOptions)
    const input = wrapper.find('input')

    await input.setValue('  BARCODE789  ')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('scan')![0]).toEqual(['BARCODE789'])
  })

  it('exposes focus method', () => {
    const wrapper = mount(BarcodeInput, mountOptions)
    expect(typeof (wrapper.vm as any).focus).toBe('function')
  })
})
