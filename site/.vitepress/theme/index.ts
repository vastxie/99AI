import mediumZoom from "medium-zoom";
import type { Zoom } from "medium-zoom";
import { nextTick, onMounted, watch } from "vue";
import { useRoute } from "vitepress";
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "./style.css";

const zoomOptions = {
  margin: 24,
  background: "rgba(15, 23, 42, 0.86)",
  scrollOffset: 40,
};

/** 正文图片点击放大 */
function useImageZoom() {
  const route = useRoute();
  let zoom: Zoom | null = null;

  function refreshImageZoom() {
    if (!zoom) {
      zoom = mediumZoom(zoomOptions);
    }
    zoom.detach();
    zoom.attach(document.querySelectorAll<HTMLElement>(".vp-doc :not(a) > img"));
  }

  onMounted(refreshImageZoom);
  watch(
    () => route.path,
    () => {
      nextTick(refreshImageZoom);
    },
  );
}

export default {
  extends: DefaultTheme,
  setup() {
    useImageZoom();
  },
} satisfies Theme;
