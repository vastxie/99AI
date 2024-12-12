<script lang="ts" setup>
import { SvgIcon } from '@/components/common';
import { useAuthStore } from '@/store';
import { copyText } from '@/utils/format';
import { throttle } from '@/utils/functions/throttle';
import { NPopover, useMessage } from 'naive-ui';
import {
  computed,
  getCurrentInstance,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue';
import { useRouter } from 'vue-router';
const authStore = useAuthStore();
interface Props {
  dataList: FileItem[];
  scaleWidth?: number;
  isDrawLike?: boolean;
  usePropmpt?: boolean;
  copyPropmpt?: boolean;
  gap?: number;
}

interface FileItem {
  id: number;
  drawUrl: string;
  fullPrompt?: string;
  drawRatio: string;
}

interface Emit {
  (ev: 'loadMore'): void;
  (ev: 'usePropmptDraw', prompt: string): void;
}
const props = withDefaults(defineProps<Props>(), {
  gap: 5,
});
const emit = defineEmits<Emit>();
const $viewerApi =
  getCurrentInstance()?.appContext.config.globalProperties.$viewerApi;
const ms = useMessage();
const boxRefs = ref<any>({});
const otherInfoContainerHeight = ref(0);
const realWidth = ref(160);
const realColumn = ref(0);
const loadComplete = ref<number[]>([]);
const wapperRef = ref<HTMLDivElement | null>(null);
const wapperHeigth = ref(0);
const isLogin = computed(() => authStore.isLogin);
const width = computed(() => {
  return props.scaleWidth
    ? Number(props.scaleWidth) * 2 + props.gap + 150
    : 150;
});

const router = useRouter();
/* 拿到图片高度 对定位top和right  新的一轮去插入最小值的那一列 贪心算法即可 */
function compilerContainer() {
  calcHeight();
  compilerColumn();
  const columns = realColumn.value;
  const itemWidth = realWidth.value;
  const cacheHeight = <any>[];
  props.dataList.forEach((item, index) => {
    const drawRatio = item.drawRatio; // 假设 drawRatio 是 "1632x2912"
    const dimensions = drawRatio.split('x'); // 使用 'x' 分割字符串
    const width = parseInt(dimensions[0], 10); // 宽度，转换为数字
    const height = parseInt(dimensions[1], 10); // 高度，转换为数字
    const bi = itemWidth / width;
    const boxheight = height * bi + props.gap + otherInfoContainerHeight.value;
    const currentBox = boxRefs.value[item.id];
    if (cacheHeight.length < columns) {
      currentBox.style.top = '0px';
      currentBox.style.left = `${(itemWidth + props.gap) * index}px`;
      cacheHeight.push(boxheight);
    } else {
      const minHeight = Math.min.apply(null, cacheHeight);
      const minIndex = cacheHeight.findIndex((t: number) => t === minHeight);
      currentBox.style.top = `${minHeight + 0}px`;
      currentBox.style.left = `${minIndex * (realWidth.value + props.gap)}px`;
      cacheHeight[minIndex] += boxheight;
    }
  });
  wapperHeigth.value = Math.max(...cacheHeight) + 100;
}

function setItemRefs(el: HTMLDivElement, item: FileItem) {
  if (el && item) {
    boxRefs.value[item.id] = el;
  }
}

/* 通过额外展示的信息计算有没有除了图片意外额外的高度 eg： 图片100px 额外显示其他信息30px cacheHeight的高度在图片的基础上需要+30 */
function calcHeight() {
  const { showName = 0, showOther = 0 } = {};
  otherInfoContainerHeight.value =
    [showName, showOther].filter((t) => t).length * 15;
}

watch(
  () => props.scaleWidth,
  (val) => {
    handleResizeThrottled();
  }
);

watch(
  () => props.dataList,
  (val) => {
    if (!val) return;
    nextTick(() => {
      handleResizeThrottled();
    });
  },
  { immediate: true }
);

/* 计算放多少列比较合理，并计算最终单个图片的宽 */
function compilerColumn() {
  if (!wapperRef.value) return;
  const containerWidth = wapperRef.value.clientWidth;

  /* 计算按目前宽度最多可以是几列 */
  realColumn.value = Math.floor(containerWidth / width.value);
  const surplus = containerWidth - realColumn.value * width.value; // 剩下的多余空间
  /* 计算如果给了左右间距那么作业间距需要占多少宽度 */
  const positionWith = (realColumn.value - 1) * props.gap; // 设置的right 需要padding的值
  /* 总宽度减去right的宽度，如果是负数考虑要不要cloumn-1 那么图片真实宽度就会比传入的宽度大 */
  if (surplus - positionWith < 0) {
    realColumn.value -= 1;
  }
  /* 图片宽度*列 + right的间距 不管大于小于总宽  多的或者少的那部分都平分给列容器 保证总宽是100% */
  realWidth.value = Math.floor(
    (containerWidth - positionWith) / realColumn.value
  );
}

function imgLoadSuccess(e: any, item: FileItem) {
  loadComplete.value.push(item.id);
}

function imgLoadError(e: any, item: FileItem) {
  loadComplete.value.push(item.id);
}

function handleCopy(item: any) {
  if (!isLogin.value) {
    return authStore.setLoginDialog(true);
  }
  const { prompt } = item;
  copyText({ text: prompt });
  ms.success('复制prompt成功');
}

function drawLike(item: any) {
  router.replace(`/midjourney?mjId=${item.id}`);
}

function usePropmptDraw(item: FileItem) {
  const { fullPrompt } = item;
  emit('usePropmptDraw', fullPrompt);
}

function handlePreview(item: any) {
  const { drawUrl } = item;

  $viewerApi({ options: {}, images: [drawUrl] });
}

const realHeight = computed(() => (item) => {
  const ratio = item.drawRatio.split('x');
  const originalWidth = Number(ratio[0]);
  const originalHeight = Number(ratio[1]);
  return originalHeight / (originalWidth / realWidth.value);
});

const handleResizeThrottled = throttle(function (this: any) {
  compilerContainer();
}, 200);

onMounted(async () => {
  window.addEventListener('resize', handleResizeThrottled);
  const container: any = document.getElementById('footer');
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        emit('loadMore');
      }
    });
  });
  observer.observe(container);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResizeThrottled);
});
</script>

<template>
  <div class="min-h-full overflow-hidden flex flex-col">
    <div class="flex-1 min-h-full p-4 relative">
      <div
        id="wapper"
        ref="wapperRef"
        class="wapper"
        :style="{ height: `${wapperHeigth}px` }"
      >
        <div
          v-for="(item, index) in dataList"
          :id="item.id.toString()"
          :key="index"
          :ref="(el) => setItemRefs(el, item)"
          class="wapper-item"
          :style="{ width: `${realWidth}px` }"
        >
          <transition name="img" :css="true">
            <img
              :id="item.id.toString()"
              class="item-file rounded-sm"
              :style="{
                width: `${realWidth}px`,
                height: `${realHeight(item)}px`,
              }"
              :src="item.drawUrl"
              loading="lazy"
              @load="imgLoadSuccess($event, item)"
              @error="imgLoadError($event, item)"
              @click="handlePreview(item)"
            />
          </transition>
          <div class="menu p-2 text-[#cbd5e1]">
            <div class="prompt">
              {{ item.fullPrompt }}
            </div>
            <div class="flex justify-end items-end space-x-2">
              <n-popover trigger="hover" v-if="isDrawLike">
                <template #trigger>
                  <button
                    class="flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]"
                    @click.stop="drawLike(item)"
                  >
                    <span class="text-sm dark:text-slate-400">
                      <SvgIcon
                        icon="fluent:draw-image-24-regular"
                        class="text-sm"
                      />
                    </span>
                  </button>
                </template>
                <span>画同款</span>
              </n-popover>

              <n-popover trigger="hover" v-if="usePropmpt">
                <template #trigger>
                  <button
                    class="flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]"
                    @click.stop="usePropmptDraw(item)"
                  >
                    <span class="text-sm dark:text-slate-400">
                      <SvgIcon
                        icon="fluent:draw-image-24-regular"
                        class="text-sm"
                      />
                    </span>
                  </button>
                </template>
                <span>使用当前画同款</span>
              </n-popover>

              <n-popover trigger="hover" v-if="copyPropmpt">
                <template #trigger>
                  <button
                    class="flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]"
                    @click.stop="handleCopy(item)"
                  >
                    <span class="text-sm dark:text-slate-400">
                      <SvgIcon icon="tabler:copy" class="text-sm" />
                    </span>
                  </button>
                </template>
                <span>复制提示词</span>
              </n-popover>
            </div>
          </div>
          <div
            class="item-loading"
            v-if="!loadComplete.includes(item.id)"
            :style="{
              width: `${realWidth}px`,
              height: `${realHeight(item)}px`,
            }"
          ></div>
        </div>
        <div id="footer" class="w-full absolute bottom-[350px]" />
      </div>
    </div>
  </div>
</template>

<style lang="less">
.market {
}

.wapper {
  width: 100%;
  position: relative;
  height: 100%;
  padding-bottom: 20px;

  &-item {
    z-index: 10;
    overflow: hidden;
    position: absolute;
    transition: all 0.5s;
    cursor: pointer;

    &:hover {
      .menu {
        transition: transform 0.3s ease-in-out;
        transform: translateY(-10px);
      }

      img {
        transform: scale(1.1);
      }
    }

    .menu {
      position: absolute;
      bottom: 0;
      width: 94%;
      left: 3%;
      max-height: 70%;
      height: 100px;
      transform: translateY(100%);
      background-color: #090b15;
      opacity: 0.8;
      transition: all 0.1s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;

      .prompt {
        height: 50px;
        overflow: hidden;
      }
    }

    img {
      user-select: none;
      cursor: pointer;
      transition: all 0.6s cubic-bezier(0.19, 1, 0.22, 1);
      border-radius: 6px;
    }

    .item-loading {
      background: url(../../assets/img-bg.png) no-repeat center center;
      filter: blur(20px);
      position: absolute;
      top: 0;
    }
  }
}

.img-enter-active,
.img-leave-active {
  transition: transform 0.3s;
}

.img-enter,
.img-leave-to {
  transform: scale(0.6);
  opacity: 0;
}
</style>
