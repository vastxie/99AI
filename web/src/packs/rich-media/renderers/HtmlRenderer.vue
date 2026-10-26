<script setup lang="ts">
import { t } from '@/locales'
import { downloadText } from '@/utils/download'
import { Monitor, Smartphone, Tablet } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

type PreviewSize = 'desktop' | 'tablet' | 'mobile'

const props = defineProps<{
  content: string
  previewSize?: PreviewSize
  compact?: boolean
  editable?: boolean
}>()

const emit = defineEmits<{
  'update:preview-size': [value: PreviewSize]
  'update:content': [value: string]
}>()

const activePreviewSize = computed<PreviewSize>(() => props.previewSize || 'desktop')
const previewDevices = [
  { value: 'desktop', labelKey: 'previewer.previewDesktop', icon: Monitor },
  { value: 'tablet', labelKey: 'previewer.previewTablet', icon: Tablet },
  { value: 'mobile', labelKey: 'previewer.previewMobile', icon: Smartphone },
] as const

const instanceId = `html-preview-${Math.random().toString(36).slice(2)}`
const frameRef = ref<HTMLIFrameElement | null>(null)
let pendingFrameUpdate = false
let frameUpdateId: ReturnType<typeof requestAnimationFrame> | null = null

function getPreviewRuntimeSource() {
  const scriptCloseTag = `</${'script'}>`
  const runtimeScript = `
    (function () {
      var instanceId = ${JSON.stringify(instanceId)};
      var hostSource = '99agent-html-preview-host';
      var editorSource = '99agent-html-preview-editor';
      var svgNamespace = 'http://www.w3.org/2000/svg';
      var currentFullDocument = false;
      var activeElement = null;
      var activeSvgInput = null;
      var originalText = '';
      var blockedTags = /^(SCRIPT|STYLE|NOSCRIPT|IFRAME|CANVAS|VIDEO|AUDIO|IMG|INPUT|TEXTAREA|SELECT|OPTION|META|LINK|HEAD|HTML)$/;

      function isFullHtmlDocument(content) {
        return /^\\s*(?:<!doctype\\s+html\\b|<html[\\s>])/i.test(content || '');
      }

      function normalizeFragmentContent(content) {
        return String(content || '').replace(/^\\s*<\\?xml[^>]*\\?>\\s*/i, '');
      }

      function parseContent(content) {
        var raw = String(content || '');
        var parser = new DOMParser();
        currentFullDocument = isFullHtmlDocument(raw);

        if (currentFullDocument) {
          return parser.parseFromString(raw, 'text/html');
        }

        return parser.parseFromString(
          '<!DOCTYPE html><html><head></head><body>' + normalizeFragmentContent(raw) + '</body></html>',
          'text/html'
        );
      }

      function isRuntimeNode(node) {
        return (
          node &&
          node.nodeType === Node.ELEMENT_NODE &&
          node.hasAttribute('data-99agent-preview-runtime')
        );
      }

      function isEditorNode(node) {
        return (
          node &&
          node.nodeType === Node.ELEMENT_NODE &&
          (node.hasAttribute('data-99agent-preview-editor') ||
            node.hasAttribute('data-99agent-preview-svg-editor'))
        );
      }

      function shouldIgnoreUserNode(node) {
        return isRuntimeNode(node) || isEditorNode(node);
      }

      function cloneScript(script) {
        var nextScript = document.createElement('script');
        Array.prototype.forEach.call(script.attributes || [], function (attr) {
          nextScript.setAttribute(attr.name, attr.value);
        });
        nextScript.text = script.textContent || '';
        return nextScript;
      }

      function importLiveNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SCRIPT') {
          return cloneScript(node);
        }

        var imported = document.importNode(node, true);
        if (imported.nodeType !== Node.ELEMENT_NODE) return imported;

        imported.querySelectorAll('script').forEach(function (script) {
          script.replaceWith(cloneScript(script));
        });

        return imported;
      }

      function isSameNodeType(currentNode, nextNode) {
        if (!currentNode || !nextNode || currentNode.nodeType !== nextNode.nodeType) return false;

        if (currentNode.nodeType !== Node.ELEMENT_NODE) return true;

        return (
          currentNode.namespaceURI === nextNode.namespaceURI &&
          currentNode.tagName === nextNode.tagName
        );
      }

      function syncAttributes(currentElement, nextElement) {
        Array.prototype.slice.call(currentElement.attributes).forEach(function (attr) {
          if (attr.name.indexOf('data-99agent-preview-') === 0) return;
          if (!nextElement.hasAttribute(attr.name)) currentElement.removeAttribute(attr.name);
        });

        Array.prototype.slice.call(nextElement.attributes).forEach(function (attr) {
          if (currentElement.getAttribute(attr.name) !== attr.value) {
            currentElement.setAttribute(attr.name, attr.value);
          }
        });
      }

      function nextUserSibling(node) {
        var current = node;
        while (current && shouldIgnoreUserNode(current)) {
          current = current.nextSibling;
        }
        return current;
      }

      function morphNode(currentNode, nextNode) {
        if (shouldIgnoreUserNode(currentNode)) return currentNode;

        if (!isSameNodeType(currentNode, nextNode)) {
          var replacement = importLiveNode(nextNode);
          currentNode.replaceWith(replacement);
          return replacement;
        }

        if (currentNode.nodeType === Node.TEXT_NODE || currentNode.nodeType === Node.COMMENT_NODE) {
          if (currentNode.nodeValue !== nextNode.nodeValue) currentNode.nodeValue = nextNode.nodeValue;
          return currentNode;
        }

        if (currentNode.nodeType !== Node.ELEMENT_NODE) return currentNode;

        if (currentNode.tagName === 'SCRIPT') {
          var nextScript = cloneScript(nextNode);
          currentNode.replaceWith(nextScript);
          return nextScript;
        }

        syncAttributes(currentNode, nextNode);
        morphChildren(currentNode, nextNode);
        return currentNode;
      }

      function morphChildren(currentParent, nextParent) {
        var currentChild = nextUserSibling(currentParent.firstChild);
        var nextChild = nextParent.firstChild;

        while (nextChild) {
          if (shouldIgnoreUserNode(nextChild)) {
            nextChild = nextChild.nextSibling;
            continue;
          }

          if (!currentChild) {
            currentParent.appendChild(importLiveNode(nextChild));
            nextChild = nextChild.nextSibling;
            continue;
          }

          var followingCurrent = nextUserSibling(currentChild.nextSibling);
          morphNode(currentChild, nextChild);
          currentChild = followingCurrent;
          nextChild = nextChild.nextSibling;
        }

        while (currentChild) {
          var removable = currentChild;
          currentChild = nextUserSibling(currentChild.nextSibling);
          removable.remove();
        }
      }

      function applyEditableState(editable) {
        if (!document.body) return;

        if (editable) {
          document.body.setAttribute('data-99agent-preview-editable', 'true');
        } else {
          document.body.removeAttribute('data-99agent-preview-editable');
          stopEditing(true);
        }
      }

      function applyContent(content, editable) {
        if (!document.head || !document.body) {
          window.setTimeout(function () {
            applyContent(content, editable);
          }, 0);
          return;
        }

        var parsed = parseContent(content);

        if (currentFullDocument) {
          syncAttributes(document.documentElement, parsed.documentElement);
          morphChildren(document.head, parsed.head || document.createElement('head'));
          morphChildren(document.body, parsed.body || document.createElement('body'));
        } else {
          document.documentElement.removeAttribute('class');
          document.documentElement.removeAttribute('style');
          morphChildren(document.head, parsed.head || document.createElement('head'));
          morphChildren(document.body, parsed.body || document.createElement('body'));
        }

        applyEditableState(Boolean(editable));
      }

      function hasDirectText(element) {
        if (!element || !element.textContent || !element.textContent.trim()) return false;
        for (var index = 0; index < element.childNodes.length; index += 1) {
          var child = element.childNodes[index];
          if (child.nodeType === Node.TEXT_NODE && child.nodeValue && child.nodeValue.trim()) {
            return true;
          }
        }
        return element.children.length === 0;
      }

      function getTextNodeFromPoint(event) {
        if (document.caretRangeFromPoint) {
          var range = document.caretRangeFromPoint(event.clientX, event.clientY);
          return range && range.startContainer;
        }

        if (document.caretPositionFromPoint) {
          var position = document.caretPositionFromPoint(event.clientX, event.clientY);
          return position && position.offsetNode;
        }

        return null;
      }

      function isInteractiveTarget(element) {
        var current = element;
        while (current && current !== document.body) {
          if (
            current.matches &&
            current.matches(
              'a, button, input, textarea, select, option, label, summary, [role="button"], [role="link"], [contenteditable]'
            )
          ) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      }

      function findEditableElement(event) {
        var node = getTextNodeFromPoint(event) || event.target;
        var eventElement = node && node.nodeType === Node.ELEMENT_NODE ? node : event.target;

        if (eventElement && isInteractiveTarget(eventElement)) return null;

        if (node && node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim()) {
          return node.parentElement;
        }

        var element = node && node.nodeType === Node.ELEMENT_NODE ? node : event.target;
        while (element && element !== document.body) {
          if (!blockedTags.test(element.tagName) && hasDirectText(element)) {
            return element;
          }
          element = element.parentElement;
        }

        return null;
      }

      function serializeDocument() {
        var documentClone = document.documentElement.cloneNode(true);
        documentClone.querySelectorAll('[data-99agent-preview-runtime]').forEach(function (node) {
          node.remove();
        });
        documentClone.querySelectorAll('[data-99agent-preview-editor]').forEach(function (node) {
          node.remove();
        });
        documentClone.querySelectorAll('[data-99agent-preview-svg-editor]').forEach(function (node) {
          node.remove();
        });
        documentClone.querySelectorAll('[data-99agent-preview-editing]').forEach(function (node) {
          node.removeAttribute('data-99agent-preview-editing');
          node.removeAttribute('contenteditable');
        });
        documentClone.querySelectorAll('[data-99agent-preview-editable]').forEach(function (node) {
          node.removeAttribute('data-99agent-preview-editable');
        });

        if (currentFullDocument) {
          return '<!DOCTYPE html>\\n' + documentClone.outerHTML;
        }

        var body = documentClone.querySelector('body');
        return body ? body.innerHTML : '';
      }

      function postUpdate() {
        window.parent.postMessage(
          {
            source: editorSource,
            type: 'html-updated',
            instanceId: instanceId,
            html: serializeDocument(),
          },
          '*'
        );
      }

      function isSvgTextElement(element) {
        return (
          element &&
          element.namespaceURI === svgNamespace &&
          /^(text|tspan)$/i.test(element.tagName || '')
        );
      }

      function clearSvgInput() {
        if (!activeSvgInput) return;
        activeSvgInput.remove();
        activeSvgInput = null;
      }

      function createSvgInput(element) {
        var rect = element.getBoundingClientRect();
        var computedStyle = window.getComputedStyle(element);
        var input = document.createElement('input');
        input.setAttribute('data-99agent-preview-svg-editor', 'true');
        input.value = originalText;
        input.style.position = 'fixed';
        input.style.left = Math.max(0, rect.left - 4) + 'px';
        input.style.top = Math.max(0, rect.top - 4) + 'px';
        input.style.width = Math.max(80, rect.width + 8) + 'px';
        input.style.height = Math.max(28, rect.height + 8) + 'px';
        input.style.zIndex = '2147483647';
        input.style.boxSizing = 'border-box';
        input.style.border = '2px solid rgba(99, 91, 255, 0.46)';
        input.style.borderRadius = '6px';
        input.style.background = 'rgba(255, 255, 255, 0.96)';
        input.style.color = computedStyle.fill && computedStyle.fill !== 'none' ? computedStyle.fill : '#111';
        input.style.font = computedStyle.font;
        input.style.padding = '2px 6px';
        input.style.outline = 'none';

        input.addEventListener('keydown', function (event) {
          event.stopPropagation();

          if (event.key === 'Enter') {
            event.preventDefault();
            stopEditing(true);
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            stopEditing(false);
          }
        });

        input.addEventListener('blur', function () {
          stopEditing(true);
        });

        document.body.appendChild(input);
        activeSvgInput = input;
        input.focus({ preventScroll: true });
        input.select();
      }

      function stopEditing(commit) {
        if (!activeElement) return;

        var element = activeElement;
        activeElement = null;

        if (activeSvgInput) {
          if (commit) {
            element.textContent = activeSvgInput.value;
          } else {
            element.textContent = originalText;
          }
          clearSvgInput();
        }

        element.removeAttribute('contenteditable');
        element.removeAttribute('data-99agent-preview-editing');

        if (!commit && !isSvgTextElement(element)) {
          element.textContent = originalText;
        }

        postUpdate();
      }

      function startEditing(element) {
        if (!element || activeElement === element) return;
        stopEditing(true);

        activeElement = element;
        originalText = element.textContent || '';
        element.setAttribute('data-99agent-preview-editing', 'true');

        if (isSvgTextElement(element)) {
          createSvgInput(element);
          return;
        }

        element.setAttribute('contenteditable', 'plaintext-only');
        if (element.contentEditable !== 'plaintext-only') {
          element.setAttribute('contenteditable', 'true');
        }
        element.focus({ preventScroll: true });

        var selection = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      document.addEventListener(
        'dblclick',
        function (event) {
          if (!document.body || document.body.getAttribute('data-99agent-preview-editable') !== 'true') {
            return;
          }

          var element = findEditableElement(event);
          if (!element) return;

          event.preventDefault();
          event.stopPropagation();
          startEditing(element);
        },
        true
      );

      document.addEventListener(
        'keydown',
        function (event) {
          if (!activeElement) return;

          if (event.key === 'Enter') {
            event.preventDefault();
            stopEditing(true);
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            stopEditing(false);
          }
        },
        true
      );

      document.addEventListener(
        'focusout',
        function () {
          if (!activeElement) return;
          if (activeSvgInput && document.activeElement === activeSvgInput) return;
          window.setTimeout(function () {
            if (activeSvgInput && document.activeElement === activeSvgInput) return;
            if (activeElement && !activeElement.contains(document.activeElement)) {
              stopEditing(true);
            }
          }, 0);
        },
        true
      );

      window.addEventListener('message', function (event) {
        var data = event.data;
        if (
          !data ||
          data.source !== hostSource ||
          data.type !== 'render-html' ||
          data.instanceId !== instanceId
        ) {
          return;
        }

        applyContent(data.html || '', Boolean(data.editable));
      });

      window.parent.postMessage(
        {
          source: editorSource,
          type: 'runtime-ready',
          instanceId: instanceId,
        },
        '*'
      );
    })();
  `

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style data-99agent-preview-runtime>
      html,
      body {
        margin: 0;
        min-height: 100%;
        background: ${'#fff' /* design-guard-allow: 预览 iframe 是独立沙箱文档，拿不到宿主 token；模拟浏览器默认白底。注释在 JS 层，不进入 srcdoc */};
      }

      [data-99agent-preview-editable='true'] {
        cursor: auto;
      }

      [data-99agent-preview-editing='true'] {
        outline: 2px solid ${'rgba(99, 91, 255, 0.42)' /* design-guard-allow: 同上，编辑态描边为固定高亮色 */} !important;
        outline-offset: 3px !important;
        cursor: text !important;
      }
    </style>
    <script data-99agent-preview-runtime>${runtimeScript}${scriptCloseTag}
  </head>
  <body></body>
</html>`
}

function clearFrameUpdate() {
  if (frameUpdateId === null) return
  cancelAnimationFrame(frameUpdateId)
  frameUpdateId = null
}

function postFrameUpdate() {
  const frameWindow = frameRef.value?.contentWindow
  if (!frameWindow) {
    pendingFrameUpdate = true
    return
  }

  pendingFrameUpdate = false
  frameWindow.postMessage(
    {
      source: '99agent-html-preview-host',
      type: 'render-html',
      instanceId,
      html: props.content || '',
      editable: Boolean(props.editable),
    },
    '*'
  )
}

function scheduleFrameUpdate() {
  pendingFrameUpdate = true

  if (frameUpdateId !== null) return

  frameUpdateId = requestAnimationFrame(() => {
    frameUpdateId = null
    postFrameUpdate()
  })
}

function handleFrameLoad() {
  postFrameUpdate()
}

function handlePreviewMessage(event: MessageEvent) {
  const data = event.data
  if (!data || data.source !== '99agent-html-preview-editor' || data.instanceId !== instanceId) {
    return
  }

  if (data.type === 'runtime-ready') {
    if (pendingFrameUpdate) postFrameUpdate()
    return
  }

  if (!props.editable || data.type !== 'html-updated' || typeof data.html !== 'string') return
  if (event.source !== frameRef.value?.contentWindow) return

  emit('update:content', data.html)
}

const exportAsHtml = () => {
  try {
    const content = props.content
    if (!content) {
      document.dispatchEvent(
        new CustomEvent('show-message', {
          detail: { type: 'error', message: t('previewer.pageContentUnavailable') },
        })
      )
      return
    }

    document.dispatchEvent(
      new CustomEvent('html-export-start', {
        detail: { type: 'HTML' },
      })
    )

    const titleMatch = content.match(/<title>(.*?)<\/title>/iu)
    const filename = titleMatch && titleMatch[1] ? `${titleMatch[1].trim()}.html` : 'index.html'
    downloadText(content, filename, 'text/html;charset=utf-8')

    document.dispatchEvent(
      new CustomEvent('show-message', {
        detail: { type: 'success', message: t('previewer.htmlDownloadStarted') },
      })
    )
  } catch (error) {
    document.dispatchEvent(
      new CustomEvent('show-message', {
        detail: { type: 'error', message: t('previewer.htmlExportFailed') },
      })
    )
  } finally {
    document.dispatchEvent(
      new CustomEvent('html-export-end', {
        detail: { type: 'HTML' },
      })
    )
  }
}

onMounted(() => {
  document.addEventListener('html-export-html', exportAsHtml)
  window.addEventListener('message', handlePreviewMessage)
  scheduleFrameUpdate()
})

onUnmounted(() => {
  clearFrameUpdate()
  document.removeEventListener('html-export-html', exportAsHtml)
  window.removeEventListener('message', handlePreviewMessage)
})

watch(
  () => [props.content, props.editable] as const,
  () => {
    scheduleFrameUpdate()
  }
)

const frameStackStyle = computed(() => {
  switch (activePreviewSize.value) {
    case 'tablet':
      return {
        width: '600px',
        height: '80%',
        margin: 'auto',
      }
    case 'mobile':
      return {
        width: '320px',
        height: '80%',
        margin: 'auto',
      }
    default:
      return {
        width: '100%',
        height: '100%',
      }
  }
})

const previewDeviceFrameClass = computed(() => [
  'preview-device-frame',
  activePreviewSize.value === 'tablet' || activePreviewSize.value === 'mobile'
    ? 'preview-device-frame-device'
    : 'preview-device-frame-full',
])

function setPreviewSize(size: PreviewSize) {
  emit('update:preview-size', size)
}
</script>

<template>
  <div class="preview-device-stage">
    <div :style="frameStackStyle" :class="previewDeviceFrameClass">
      <iframe
        ref="frameRef"
        class="preview-device-frame-iframe"
        :srcdoc="getPreviewRuntimeSource()"
        frameborder="0"
        sandbox="allow-scripts allow-popups allow-forms"
        referrerpolicy="no-referrer"
        @load="handleFrameLoad"
      ></iframe>
    </div>

    <div
      v-if="!compact"
      class="pointer-events-none absolute inset-x-0 bottom-2.5 z-1 flex justify-center"
    >
      <div
        class="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-app-border bg-app-sunken p-0.5 shadow-lg"
      >
        <button
          v-for="device in previewDevices"
          :key="device.value"
          type="button"
          class="inline-flex h-7 w-9 items-center justify-center rounded-full transition-colors"
          :class="
            activePreviewSize === device.value
              ? 'bg-app-elevated text-text-primary shadow-sm'
              : 'fg-quiet hover:bg-btn-ghost-hover'
          "
          :aria-label="t(device.labelKey)"
          :aria-pressed="activePreviewSize === device.value"
          @click="setPreviewSize(device.value)"
        >
          <component :is="device.icon" :size="16" :stroke-width="2.1" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-device-stage {
  position: relative;
  display: flex;
  height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--preview-device-stage-bg, var(--panel-bg-subtle));
}

.preview-device-frame {
  position: relative;
  overflow: hidden;
  background: #fff; /* design-guard-allow: 设备框模拟浏览器画布，固定白底不随主题 */
  transition:
    width var(--motion-duration-sm) ease,
    height var(--motion-duration-sm) ease,
    border-radius var(--motion-duration-sm) ease,
    box-shadow var(--motion-duration-sm) ease;
}

.preview-device-frame-iframe {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
  background: #fff; /* design-guard-allow: 同设备框，iframe 加载前也保持白底 */
}

.preview-device-frame-full {
  border: 0;
}

.preview-device-frame-device {
  max-width: calc(100% - 2rem);
  max-height: calc(100% - 4.75rem);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-3xl);
  box-shadow: 0 18px 48px rgb(15 23 42 / 12%); /* design-guard-allow: 设备框外阴影为固定视觉（模拟真机投影），不随主题 */
}
</style>
