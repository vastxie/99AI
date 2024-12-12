import type { Ref } from 'vue';
import { nextTick, onMounted, onUnmounted, ref } from 'vue';

type ScrollElement = HTMLDivElement | null;

interface ScrollReturn {
  scrollRef: Ref<ScrollElement>;
  scrollToBottom: () => Promise<void>;
  scrollToTop: () => Promise<void>;
  scrollToBottomIfAtBottom: () => Promise<void>;
}

let isInteracting = false;
let interactionTimeoutId: number | undefined;

export function useScroll(): ScrollReturn {
  const scrollRef = ref<ScrollElement>(null);
  let lastScrollTop = 0;

  const scrollToBottom = async () => {
    await nextTick();
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight; // 滚动到底部
    }
  };

  const scrollToTop = async () => {
    await nextTick();
    if (scrollRef.value) scrollRef.value.scrollTop = 0;
  };

  async function scrollToBottomIfAtBottom() {
    await nextTick();
    if (scrollRef.value) {
      const threshold = 200;
      const distanceToBottom =
        scrollRef.value.scrollHeight -
        scrollRef.value.scrollTop -
        scrollRef.value.clientHeight;

      if (!isInteracting && distanceToBottom <= threshold) {
        scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
      }
    }
  }

  const handleInteractionEnd = () => {
    if (interactionTimeoutId !== undefined) {
      clearTimeout(interactionTimeoutId);
    }

    isInteracting = true;

    interactionTimeoutId = window.setTimeout(() => {
      isInteracting = false;
    }, 2000); // 停止交互2秒后重置isInteracting
  };

  const handleScroll = () => {
    if (scrollRef.value) {
      const currentScrollTop = scrollRef.value.scrollTop;
      if (currentScrollTop < lastScrollTop) {
        // 用户向上滚动，暂停自动滚动
        isInteracting = true;
        handleInteractionEnd(); // 2秒后重置isInteracting
      }
      lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop; // 防止负值
    }
  };

  onMounted(() => {
    if (scrollRef.value) {
      scrollRef.value.addEventListener('scroll', handleScroll, true);
    }
  });

  onUnmounted(() => {
    if (scrollRef.value) {
      scrollRef.value.removeEventListener('scroll', handleScroll, true);
    }
  });

  return {
    scrollRef,
    scrollToBottom,
    scrollToTop,
    scrollToBottomIfAtBottom,
  };
}
