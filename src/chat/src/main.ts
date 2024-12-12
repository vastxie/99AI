import { createApp } from 'vue';
import App from './App.vue';
import { setupI18n } from './locales';
import { setupAssets, setupScrollbarStyle } from './plugins';
import { setupRouter } from './router';
import { setupStore } from './store';
import './styles/global.less';

// 禁用生产环境中的 console.log
if (process.env.NODE_ENV === 'production') {
  console.log = function () {};
}

async function bootstrap() {
  const app = createApp(App);

  // 定义自定义指令
  app.directive('focus', {
    // 当被绑定的元素挂载到 DOM 上时
    mounted(el) {
      // 聚焦元素
      el.focus();
    },
  });

  // 设置样式和资源
  setupAssets();
  setupScrollbarStyle();
  setupStore(app);
  setupI18n(app);
  await setupRouter(app);

  // 延迟加载插件
  const { default: VueViewer } = await import('v-viewer');
  app.use(VueViewer);
  const { MotionPlugin } = await import('@vueuse/motion');
  app.use(MotionPlugin);

  app.mount('#app');
}

bootstrap();
