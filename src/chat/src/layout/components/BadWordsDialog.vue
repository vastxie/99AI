<script setup lang="ts">
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import 'md-editor-v3/lib/preview.css';
import { computed, ref, watch } from 'vue';

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();

const authStore = useAuthStore();
const useGlobalStore = useGlobalStoreWithOut();

const globalConfig = computed(() => authStore.globalConfig); // 获取全局配置

const countdown = ref(15); // 倒计时 15 秒
const isCountdownFinished = ref(false); // 倒计时结束标志

function startCountdown() {
  const interval = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value -= 1;
    } else {
      isCountdownFinished.value = true; // 倒计时结束
      clearInterval(interval); // 清除定时器
    }
  }, 1000);
}

function handleAgree() {
  if (isCountdownFinished.value) {
    useGlobalStore.UpdateBadWordsDialog(false); // 关闭用户协议弹窗
    countdown.value = 15;
    isCountdownFinished.value = false;
  }
}

// onMounted(() => {
//   startCountdown(); // 组件挂载时启动倒计时
// });

// 监听 props.visible 的变化，当其变为 true 时重新启动倒计时
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      startCountdown();
    }
  },
  { immediate: true } // 添加 immediate 选项，初始化时立即执行
);

// 初始启动一次倒计时
if (props.visible) {
  startCountdown();
}

// onUnmounted(() => {
//   // countdown.value = 15;
//   isCountdownFinished.value = false; // 重置状态
// });
</script>

<template>
  <div
    v-if="props.visible"
    class="fixed inset-0 z-50 px-2 flex items-center justify-center bg-black bg-opacity-50"
  >
    <div
      class="bg-white dark:bg-gray-900 p-4 rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col relative"
    >
      <!-- 显示用户协议标题 -->
      <div class="flex justify-between items-center mb-3">
        <span class="text-xl">合理合规须知</span>
      </div>

      <!-- 直接显示用户协议的 HTML 内容 -->
      <div class="flex-1 overflow-y-auto">
        <!-- <div
          v-html="globalConfig.agreementInfo"
          class="dark:bg-gray-900 p-4"
        ></div> -->
        <p>请合理合规使用，请勿咨询敏感信息或使用敏感词生成图片。</p>
        <p>
          多次触发平台风控，将记录【账号/IP】等信息并禁止使用，保留向有关部门提交相关记录的权利。
        </p>
      </div>

      <!-- 倒计时和同意按钮 -->
      <div class="flex justify-end mt-3">
        <button
          :disabled="!isCountdownFinished"
          @click="handleAgree"
          class="px-4 py-2 shadow-sm bg-primary-600 text-white rounded-md hover:bg-primary-500 disabled:bg-gray-400"
        >
          <span v-if="isCountdownFinished">已知晓</span>
          <span v-else>请等待 {{ countdown }} 秒</span>
        </button>
      </div>
    </div>
  </div>
</template>
