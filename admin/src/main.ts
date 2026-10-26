import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
// 覆盖层必须紧跟在 Element Plus 的样式之后，靠源码顺序生效（见文件头注释）
import '@/styles/element-overrides.scss';
import 'virtual:uno.css';
import '@/styles/base.scss';
import App from './App.vue';
import router from './router';
import { pinia } from './store';

createApp(App).use(pinia).use(router).use(ElementPlus).mount('#app');
