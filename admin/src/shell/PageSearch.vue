<script setup lang="ts">
  import { useEventListener } from '@vueuse/core';
  import { groupRoutes } from '@/router/groups';
  import type { SearchEntry } from '@/router/navigation';
  import { buildNavGroups, buildSearchEntries, searchEntries } from '@/router/navigation';
  import useShellStore from '@/store/modules/shell';
  import useUserStore from '@/store/modules/user';
  import { isEditableTarget } from './keyboard';
  import KeyHint from './KeyHint.vue';

  /**
   * 页面搜索：在侧栏的全部页面里按名称、路径或所属分组查找并跳转。
   * Alt+S 打开（正在输入、或有对话框 / 抽屉开着时不响应）。打开后始终选中一条结果：
   * 输入关键字即选中排在最前的一条，↑ ↓ 换一条，回车打开，Esc 或点遮罩关闭。
   * 这些按键只在面板里生效；焦点留在输入框里，关闭后回到打开前的位置。
   */
  const router = useRouter();
  const shell = useShellStore();
  const user = useUserStore();

  const query = ref('');
  const selected = ref(0);
  const panelRef = ref<HTMLElement>();
  const inputRef = ref<HTMLInputElement>();
  const listRef = ref<HTMLElement>();
  /** 打开时锁了滚动、记下了焦点，还没还原 */
  let opened = false;
  let returnFocusTo: HTMLElement | null = null;
  let unlockPage: (() => void) | undefined;

  const entries = computed(() => buildSearchEntries(buildNavGroups(groupRoutes, user.hasRole)));
  const matches = computed(() => searchEntries(entries.value, query.value));

  watch(query, () => {
    selected.value = 0;
    listRef.value?.scrollTo({ top: 0 });
  });

  watch(
    () => shell.searchOpen,
    (open) => (open ? handleOpen() : handleClose()),
  );

  /**
   * 打开期间锁住页面滚动：和抽屉、Element Plus 对话框一样锁在 body 上（由 body 传给视口，滚动位置不变），
   * 并补上滚动条让出的宽度；已经有别处锁住时不再叠加。
   */
  function lockPageScroll() {
    const { body } = document;
    if (getComputedStyle(body).overflow === 'hidden') return undefined;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const { overflow, paddingRight } = body.style;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
    };
  }

  /** 有对话框或抽屉开着时不从快捷键打开搜索：面板会落在对话框下面，按键也会互相抢 */
  function blockedByOverlay(target: EventTarget | null) {
    if (shell.drawerOpen || document.body.classList.contains('el-popup-parent--hidden'))
      return true;
    return target instanceof Element && Boolean(target.closest('[role="dialog"], .el-overlay'));
  }

  function handleOpen() {
    opened = true;
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    query.value = '';
    selected.value = 0;
    unlockPage = lockPageScroll();
    void nextTick(() => {
      inputRef.value?.focus();
      // 个别环境不允许脚本把焦点放进输入框：退而聚焦面板本身，面板里的按键照样可用
      if (!panelRef.value?.contains(document.activeElement)) panelRef.value?.focus();
    });
  }

  function handleClose() {
    if (!opened) return;
    opened = false;
    unlockPage?.();
    unlockPage = undefined;
    // 触发按钮可能已随页面滚出视口，还焦点时不把页面滚回去
    returnFocusTo?.focus({ preventScroll: true });
    returnFocusTo = null;
  }

  function close() {
    shell.searchOpen = false;
  }

  function moveSelection(offset: number) {
    const count = matches.value.length;
    if (!count) return;
    selected.value = (selected.value + offset + count) % count;
    void nextTick(() => {
      listRef.value
        ?.querySelector<HTMLElement>('.search-row.is-selected')
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  function open(entry: SearchEntry | undefined) {
    if (!entry) return;
    close();
    void router.push(entry.path);
  }

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (shell.searchOpen) return;
    const isShortcut = event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyS';
    if (!isShortcut || isEditableTarget(event.target) || blockedByOverlay(event.target)) return;
    event.preventDefault();
    shell.searchOpen = true;
  });

  /** 面板里的按键；面板本身可聚焦，点了面板空白处键盘选择照样可用 */
  function onPanelKeydown(event: KeyboardEvent) {
    // 中文输入法选词时的回车与方向键交给输入法（Safari 结束组词的那次按键 keyCode 为 229）
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowDown') moveSelection(1);
    else if (event.key === 'ArrowUp') moveSelection(-1);
    else if (event.key === 'Enter') open(matches.value[selected.value]);
    // 焦点只留在输入框里，Tab 不会跑到遮罩后面的页面上
    else if (event.key === 'Tab') inputRef.value?.focus();
    else return;
    event.preventDefault();
  }

  // 外壳卸载（退出登录、会话过期）时，排队中的关闭回调随组件一起作废，这里直接还原
  onBeforeUnmount(handleClose);
</script>

<template>
  <Teleport to="body">
    <Transition name="page-search" :duration="{ enter: 160, leave: 120 }">
      <div v-if="shell.searchOpen" class="page-search">
        <div class="page-search__backdrop" @click="close" />
        <div
          ref="panelRef"
          class="page-search__panel"
          role="dialog"
          aria-modal="true"
          aria-label="搜索页面"
          tabindex="-1"
          @keydown="onPanelKeydown"
        >
          <label class="page-search__field">
            <AppIcon name="i-lucide:search" :size="16" />
            <input
              ref="inputRef"
              v-model="query"
              class="page-search__input"
              placeholder="输入页面名称或路径"
              role="combobox"
              aria-autocomplete="list"
              :aria-expanded="matches.length > 0"
              :aria-controls="matches.length ? 'page-search-results' : undefined"
              :aria-activedescendant="matches.length ? `page-search-option-${selected}` : undefined"
            />
          </label>
          <ul
            v-if="matches.length"
            id="page-search-results"
            ref="listRef"
            class="page-search__results"
            role="listbox"
          >
            <li
              v-for="(entry, index) in matches"
              :id="`page-search-option-${index}`"
              :key="entry.path"
              role="option"
              :aria-selected="index === selected"
            >
              <a
                :href="router.resolve(entry.path).href"
                class="search-row"
                :class="{ 'is-selected': index === selected }"
                tabindex="-1"
                @click.prevent="open(entry)"
                @mousemove="selected = index"
              >
                <AppIcon v-if="entry.icon" :name="entry.icon" :size="16" class="search-row__icon" />
                <span class="search-row__title">{{ entry.title }}</span>
                <span class="search-row__group">{{ entry.trail[0] }}</span>
              </a>
            </li>
          </ul>
          <p v-else class="page-search__empty">没有匹配的页面，换个关键词试试</p>
          <footer v-if="!shell.isCompact" class="page-search__hints">
            <span><KeyHint>↑</KeyHint><KeyHint>↓</KeyHint>选择</span>
            <span><KeyHint>↵</KeyHint>打开</span>
            <span><KeyHint>Esc</KeyHint>关闭</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .page-search {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 12vh 16px 16px;
  }

  @media (min-width: 1024px) {
    .page-search {
      padding-top: 14vh;
    }
  }

  .page-search__backdrop {
    position: absolute;
    inset: 0;
    background: var(--u-overlay);
  }

  .page-search__panel {
    position: relative;
    outline: none;
    display: flex;
    flex-direction: column;
    width: min(600px, 100%);
    max-height: 70vh;
    overflow: hidden;
    background: var(--u-bg-elevated);
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-l);
    box-shadow: var(--u-shadow-l);
  }

  .page-search__field {
    display: flex;
    flex: none;
    gap: 10px;
    align-items: center;
    height: 48px;
    padding: 0 14px;
    color: var(--u-text-secondary);
    border-bottom: 1px solid var(--u-border-light);
  }

  .page-search__input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    font-family: inherit;
    font-size: 15px;
    color: var(--u-text-primary);
    background: transparent;
    border: 0;
    outline: none;
  }

  .page-search__input::placeholder {
    color: var(--u-text-placeholder);
  }

  .page-search__results {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
  }

  .search-row {
    display: flex;
    gap: 10px;
    align-items: center;
    height: 40px;
    padding: 0 10px;
    color: var(--u-text-regular);
    text-decoration: none;
    border-radius: var(--u-radius-m);
  }

  .search-row.is-selected {
    color: var(--u-text-primary);
    background-color: var(--u-bg-fill);
  }

  .search-row__icon {
    flex: none;
    color: var(--u-text-secondary);
  }

  .search-row.is-selected .search-row__icon {
    color: var(--u-accent);
  }

  .search-row__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-row__group {
    flex: none;
    font-size: 12px;
    color: var(--u-text-placeholder);
  }

  .page-search__empty {
    margin: 0;
    padding: 28px 16px;
    font-size: 13px;
    color: var(--u-text-secondary);
    text-align: center;
  }

  .page-search__hints {
    display: flex;
    flex: none;
    gap: 16px;
    align-items: center;
    padding: 8px 14px;
    font-size: 12px;
    color: var(--u-text-secondary);
    background-color: var(--u-bg-subtle);
    border-top: 1px solid var(--u-border-light);
  }

  .page-search__hints span {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .page-search-enter-active .page-search__backdrop,
  .page-search-leave-active .page-search__backdrop {
    transition: opacity 0.16s ease;
  }

  .page-search-enter-from .page-search__backdrop,
  .page-search-leave-to .page-search__backdrop {
    opacity: 0;
  }

  .page-search-enter-active .page-search__panel {
    transition:
      opacity 0.16s ease-out,
      transform 0.16s ease-out;
  }

  .page-search-leave-active .page-search__panel {
    transition:
      opacity 0.12s ease-in,
      transform 0.12s ease-in;
  }

  .page-search-enter-from .page-search__panel,
  .page-search-leave-to .page-search__panel {
    opacity: 0;
    transform: scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    .page-search-enter-from .page-search__panel,
    .page-search-leave-to .page-search__panel {
      transform: none;
    }
  }
</style>
