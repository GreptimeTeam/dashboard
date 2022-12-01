import { DirectiveBinding } from 'vue'
import { useUserStore } from '@/store'

function checkPermission(el: HTMLElement, binding: DirectiveBinding) {
  const { value } = binding

  if (Array.isArray(value)) {
    el?.parentNode?.removeChild(el)
  } else {
    throw new Error(`need roles! Like v-permission="['admin','user']"`)
  }
}

export default {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  },
}
