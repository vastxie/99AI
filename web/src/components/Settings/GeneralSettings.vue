<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'

import { Check, ChevronDown, Moon, Sun, SunMoon } from '@lucide/vue'

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import DropdownMenu, { MenuItem } from '@/components/common/DropdownMenu'
import { setLocale } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { parseEnabledLanguages, type Language, type Theme } from '@/store/modules/app/preferences'
import { useAuthStore } from '@/store/modules/auth'
import { message } from '@/utils/message'
import { accentColors, accentColorOptions, type AccentColor } from '@/utils/accentColor'

interface Props {
  visible: boolean
}

defineProps<Props>()

const appStore = useAppStore()
const authStore = useAuthStore()
const { t } = useI18n()

const currentLanguage = computed(() => appStore.language)
const isLanguageMenuOpen = ref(false)
const isAccentMenuOpen = ref(false)
const isThemeMenuOpen = ref(false)
const accentSwatch = (color: keyof typeof accentColors) =>
  `rgb(${accentColors[color].dark.join(' ')})`

const themeOptions = computed(() => [
  { value: 'auto' as Theme, label: t('settings.themeAuto'), icon: SunMoon },
  { value: 'light' as Theme, label: t('settings.lightMode'), icon: Sun },
  { value: 'dark' as Theme, label: t('settings.darkMode'), icon: Moon },
])

const currentThemeOption = computed(
  () => themeOptions.value.find(option => option.value === appStore.theme) ?? themeOptions.value[1]
)

const allLanguageOptions: { value: Language; label: string; icon: string }[] = [
  { value: 'zh-CN', label: '简体中文', icon: '🇨🇳' },
  { value: 'en-US', label: 'English', icon: '🇺🇸' },
]

const languageOptions = computed(() => {
  const enabledLanguages = parseEnabledLanguages(authStore.globalConfig?.enabledLanguages)
  return allLanguageOptions.filter(option => enabledLanguages.includes(option.value))
})

function setThemeMode(theme: Theme, close: () => void) {
  appStore.setTheme(theme)
  close()
}

function selectAccent(color: AccentColor, close: () => void) {
  appStore.setAccentColor(color)
  close()
}

function switchLanguage(lang: Language) {
  const availableLanguages = languageOptions.value.map(opt => opt.value)
  if (!availableLanguages.includes(lang)) {
    return
  }
  isLanguageMenuOpen.value = false
  // setLocale 已异步化（懒加载语言包）；成功后再同步 store，
  // 失败（弱网 chunk 拉取失败）保持当前语言并提示用户
  setLocale(lang)
    .then(ok => {
      if (ok) {
        appStore.setLanguage(lang)
      } else {
        message()?.error(t('common.genericErrorRetry'))
      }
    })
    .catch(() => {
      message()?.error(t('common.genericErrorRetry'))
    })
}
</script>

<template>
  <div>
    <div class="settings-card mb-4 flex flex-col space-y-4 p-4">
      <div class="grid grid-cols-1 gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0 flex items-center">
            <div>
              <div class="settings-field-title ds-form-label flex items-center">
                {{ t('settings.interfaceTheme') }}
              </div>
              <div class="settings-field-description ds-form-helper">
                {{ currentThemeOption.label }}
              </div>
            </div>
          </div>
          <DropdownMenu
            v-model="isThemeMenuOpen"
            teleport
            position="bottom-right"
            menu-class="menu-select"
            min-width="160px"
          >
            <template #trigger="{ triggerProps }">
              <UiButton
                v-bind="triggerProps"
                variant="select"
                class="min-w-[7rem] justify-between"
                :aria-label="t('settings.interfaceTheme')"
              >
                <span class="flex items-center gap-2">
                  <component :is="currentThemeOption.icon" :size="16" aria-hidden="true" />
                  {{ currentThemeOption.label }}
                </span>
                <ChevronDown :size="16" aria-hidden="true" />
              </UiButton>
            </template>
            <template #menu="{ close }">
              <div class="menu-select-list">
                <MenuItem
                  v-for="option in themeOptions"
                  :key="option.value"
                  role="menuitemradio"
                  :aria-checked="appStore.theme === option.value"
                  :active="appStore.theme === option.value"
                  :title="option.label"
                  @click="setThemeMode(option.value, close)"
                >
                  <template #icon
                    ><component :is="option.icon" :size="16" aria-hidden="true"
                  /></template>
                  <template #suffix
                    ><Check v-if="appStore.theme === option.value" :size="16" aria-hidden="true"
                  /></template>
                </MenuItem>
              </div>
            </template>
          </DropdownMenu>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center">
            <div>
              <div class="settings-field-title ds-form-label flex items-center">
                {{ t('settings.interfaceLanguage') }}
              </div>
              <div class="settings-field-description ds-form-helper">
                {{ t('settings.selectYourLanguage') }}
              </div>
            </div>
          </div>
          <div class="relative">
            <DropdownMenu
              v-model="isLanguageMenuOpen"
              teleport
              position="bottom-right"
              :max-height="'200px'"
              menu-class="menu-select"
            >
              <template #trigger="{ triggerProps }">
                <UiButton
                  variant="select"
                  v-bind="triggerProps"
                  type="button"
                  class="min-w-[7rem] justify-between"
                >
                  <span class="flex items-center gap-2">
                    <span aria-hidden="true">
                      {{
                        languageOptions.find(lang => lang.value === currentLanguage)?.icon || '🌐'
                      }}
                    </span>
                    <span>
                      {{
                        languageOptions.find(lang => lang.value === currentLanguage)?.label ||
                        t('settings.language')
                      }}
                    </span>
                  </span>
                  <ChevronDown :size="16" aria-hidden="true" />
                </UiButton>
              </template>
              <template #menu="{ close }">
                <div class="menu-select-list">
                  <MenuItem
                    v-for="lang in languageOptions"
                    :key="lang.value"
                    type="button"
                    :active="currentLanguage === lang.value"
                    :title="lang.label"
                    @click="
                      () => {
                        switchLanguage(lang.value as Language)
                        close()
                      }
                    "
                    role="menuitem"
                    :aria-current="currentLanguage === lang.value ? 'true' : undefined"
                  >
                    <template #icon>{{ lang.icon }}</template>
                    <template #suffix>
                      <Check
                        v-if="currentLanguage === lang.value"
                        :size="16"
                        class="ml-auto"
                        aria-hidden="true"
                      />
                    </template>
                  </MenuItem>
                </div>
              </template>
            </DropdownMenu>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="settings-field-title ds-form-label">{{ t('settings.accentColor') }}</div>
            <div class="settings-field-description ds-form-helper">
              {{ t('settings.accentLocalOnly') }}
            </div>
          </div>
          <DropdownMenu
            v-model="isAccentMenuOpen"
            teleport
            position="bottom-right"
            menu-class="menu-select"
            min-width="160px"
          >
            <template #trigger="{ triggerProps }">
              <UiButton
                v-bind="triggerProps"
                variant="select"
                class="min-w-[7rem] justify-between"
                :aria-label="t('settings.accentColor')"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="h-2.5 w-2.5 shrink-0 rounded-full"
                    :style="{ backgroundColor: accentSwatch(appStore.accentColor) }"
                    aria-hidden="true"
                  ></span>
                  {{ t(`settings.accentColors.${appStore.accentColor}`) }}
                </span>
                <ChevronDown :size="16" aria-hidden="true" />
              </UiButton>
            </template>
            <template #menu="{ close }">
              <div class="menu-select-list">
                <MenuItem
                  v-for="color in accentColorOptions"
                  :key="color"
                  role="menuitemradio"
                  :aria-checked="appStore.accentColor === color"
                  :active="appStore.accentColor === color"
                  :title="t(`settings.accentColors.${color}`)"
                  @click="selectAccent(color, close)"
                >
                  <template #icon
                    ><span
                      class="h-2.5 w-2.5 rounded-full"
                      :style="{ backgroundColor: accentSwatch(color) }"
                      aria-hidden="true"
                    ></span
                  ></template>
                  <template #suffix
                    ><Check v-if="appStore.accentColor === color" :size="16" aria-hidden="true"
                  /></template>
                </MenuItem>
              </div>
            </template>
          </DropdownMenu>
        </div>
      </div>
    </div>
  </div>
</template>
