<template>
  <a-modal
    class="contact-form-modal"
    :visible="visible"
    :title="$t('contact.title')"
    :footer="false"
    :closable="true"
    :mask-closable="true"
    :width="520"
    unmount-on-close
    @cancel="close"
  >
    <p class="contact-subtitle">{{ $t('contact.subtitle') }}</p>
    <a-form
      id="dashboard-contact-form"
      ref="formRef"
      class="contact-form"
      :model="form"
      layout="vertical"
      @submit="handleSubmit"
    >
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item
            field="name"
            :label="$t('contact.name')"
            :rules="[{ required: true, message: $t('contact.nameRequired') }]"
            asterisk-position="end"
          >
            <a-input v-model="form.name" :placeholder="$t('contact.namePlaceholder')" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item
            field="email"
            :label="$t('contact.email')"
            :rules="[{ required: true, message: $t('contact.emailRequired'), type: 'email' }]"
            asterisk-position="end"
          >
            <a-input v-model="form.email" :placeholder="$t('contact.emailPlaceholder')" />
          </a-form-item>
        </a-col>
      </a-row>
      <a-form-item field="phone" :label="$t('contact.phone')">
        <a-input v-model="form.phone" :placeholder="$t('contact.phonePlaceholder')" />
      </a-form-item>
      <a-form-item field="company" :label="$t('contact.company')">
        <a-input v-model="form.company" :placeholder="$t('contact.companyPlaceholder')" />
      </a-form-item>
      <a-form-item field="position" :label="$t('contact.position')">
        <a-input v-model="form.position" :placeholder="$t('contact.positionPlaceholder')" />
      </a-form-item>
      <a-form-item
        field="content"
        :label="$t('contact.content')"
        :rules="[{ required: true, message: $t('contact.contentRequired') }]"
        asterisk-position="end"
      >
        <a-textarea
          v-model="form.content"
          :placeholder="$t('contact.contentPlaceholder')"
          :auto-size="{ minRows: 3 }"
        />
      </a-form-item>
      <!-- Honeypot: hidden from users, bots often fill it -->
      <a-form-item class="contact-honeypot" aria-hidden="true">
        <a-input v-model="form.post" tabindex="-1" autocomplete="off" />
      </a-form-item>
      <a-alert v-if="submitSuccessVisible" type="success" show-icon class="contact-success-alert">
        {{ $t('contact.success') }}
      </a-alert>
      <a-form-item>
        <a-button html-type="submit" type="primary" long :loading="isSubmitting" :disabled="isSubmitting">
          {{ isSubmitting ? $t('contact.submitting') : $t('contact.submit') }}
        </a-button>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts" name="ContactFormModal">
  import { reactive, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { Message } from '@arco-design/web-vue'
  import type { FormInstance } from '@arco-design/web-vue'
  import { submitFeedback } from '@/api/feedback'
  import useContactForm from './use-contact-form'

  const STORAGE_KEY = 'contact_form_last_submission'
  const MIN_FILL_MS = 3000
  const MIN_RESUBMIT_MS = 5000

  const { t } = useI18n()
  const { visible, close } = useContactForm()

  const formRef = ref<FormInstance>()
  const isSubmitting = ref(false)
  const submitSuccessVisible = ref(false)
  const formStartTime = ref(Date.now())
  const lastSubmissionTime = ref(0)
  const userInteracted = ref(false)
  const interactionCount = ref(0)
  const formFieldInteractions = ref(new Set<string>())

  const form = reactive({
    name: '',
    email: '',
    phone: '',
    company: '',
    position: '',
    content: '',
    post: '',
  })

  function resetForm() {
    form.name = ''
    form.email = ''
    form.phone = ''
    form.company = ''
    form.position = ''
    form.content = ''
    form.post = ''
    formRef.value?.clearValidate()
  }

  function resetInteractionTracking() {
    userInteracted.value = false
    interactionCount.value = 0
    formFieldInteractions.value.clear()
    formStartTime.value = Date.now()
  }

  function trackInteraction(eventType = 'unknown') {
    userInteracted.value = true
    interactionCount.value += 1
    if (eventType.startsWith('form:')) {
      formFieldInteractions.value.add(eventType)
    }
  }

  function attachInteractionListeners() {
    const formElement = document.getElementById('dashboard-contact-form')
    if (!formElement) return () => undefined

    const onWindow = () => trackInteraction('window')
    const windowEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'] as const
    windowEvents.forEach((event) => {
      window.addEventListener(event, onWindow, { passive: true })
    })

    const onInput = (e: Event) => {
      const target = e.target as HTMLElement | null
      trackInteraction(`form:input:${target?.tagName ?? 'UNKNOWN'}`)
    }
    const onFocus = (e: Event) => {
      const target = e.target as HTMLElement | null
      trackInteraction(`form:focus:${target?.tagName ?? 'UNKNOWN'}`)
    }
    const onKeydown = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        trackInteraction(`form:keydown:${target.tagName}`)
      }
    }

    formElement.addEventListener('input', onInput, { passive: true })
    formElement.addEventListener('focus', onFocus, { capture: true, passive: true })
    formElement.addEventListener('keydown', onKeydown, { passive: true })

    return () => {
      windowEvents.forEach((event) => window.removeEventListener(event, onWindow))
      formElement.removeEventListener('input', onInput)
      formElement.removeEventListener('focus', onFocus, true)
      formElement.removeEventListener('keydown', onKeydown)
    }
  }

  let detachListeners: (() => void) | undefined

  watch(visible, (open) => {
    if (open) {
      submitSuccessVisible.value = false
      resetInteractionTracking()
      // Form mounts after modal open; wait a tick for #dashboard-contact-form.
      requestAnimationFrame(() => {
        detachListeners?.()
        detachListeners = attachInteractionListeners()
      })
      return
    }
    detachListeners?.()
    detachListeners = undefined
  })

  function isValidSubmission(): boolean {
    if (form.post.trim() !== '') {
      Message.warning(t('contact.botDetected'))
      return false
    }

    if (Date.now() - formStartTime.value < MIN_FILL_MS) {
      Message.warning(t('contact.tooFast'))
      return false
    }

    if (!userInteracted.value || interactionCount.value < 2 || formFieldInteractions.value.size === 0) {
      Message.warning(t('contact.botDetected'))
      return false
    }

    const hasValues = !!(form.name || form.email || form.phone || form.company || form.position || form.content)
    if (hasValues && formFieldInteractions.value.size === 0) {
      Message.warning(t('contact.botDetected'))
      return false
    }

    const now = Date.now()
    if (now - lastSubmissionTime.value < MIN_RESUBMIT_MS) {
      Message.warning(t('contact.duplicate'))
      return false
    }

    const lastStored = localStorage.getItem(STORAGE_KEY)
    if (lastStored && now - parseInt(lastStored, 10) < MIN_RESUBMIT_MS) {
      Message.warning(t('contact.duplicate'))
      return false
    }

    return true
  }

  async function handleSubmit({ errors }: { errors?: unknown }) {
    if (errors) return

    if (isSubmitting.value) {
      Message.warning(t('contact.duplicate'))
      return
    }

    submitSuccessVisible.value = false
    if (!isValidSubmission()) return

    isSubmitting.value = true
    lastSubmissionTime.value = Date.now()
    localStorage.setItem(STORAGE_KEY, String(Date.now()))

    try {
      const result = await submitFeedback({
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        position: form.position,
        content: form.content,
      })

      if (!result.error) {
        submitSuccessVisible.value = true
        resetForm()
        resetInteractionTracking()
      } else {
        Message.error(result.error)
      }
    } catch {
      Message.error(t('contact.fail'))
    } finally {
      setTimeout(() => {
        isSubmitting.value = false
      }, 1000)
      formStartTime.value = Date.now()
    }
  }
</script>

<style lang="less" scoped>
  .contact-subtitle {
    margin: 0 0 16px;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-md);
    line-height: 1.6;
  }

  .contact-honeypot {
    position: absolute;
    left: -9999px;
    opacity: 0;
    pointer-events: none;
  }

  .contact-success-alert {
    margin-bottom: 16px;
  }
</style>

<style lang="less">
  .contact-form-modal {
    .arco-modal-body {
      padding-top: 8px;
    }
  }
</style>
