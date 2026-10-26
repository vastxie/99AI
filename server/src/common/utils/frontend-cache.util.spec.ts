import {
  frontendCacheControl,
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
} from './frontend-cache.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('frontendCacheControl', () => {
  it('带内容哈希的构建产物长期缓存、不再回源验证', () => {
    for (const file of [
      '/srv/app/public/chat/assets/chat-BlFpdtKJ.js',
      '/srv/app/public/chat/assets/chunk-FOHPRMQF-CkfmJU5Y.js',
      '/srv/app/public/chat/assets/AccountData-9AZIa7-b.js',
      '/srv/app/public/chat/css/index-BfCdXfMF.css',
      '/srv/app/public/chat/fonts/KaTeX_Main-Regular-C1b5YtWf.woff2',
      '/srv/app/public/chat/mjs/pdf.worker.min-D3Ptkq_c.mjs',
      '/srv/app/public/chat/images/logo-Bx7_Zm9Q.png',
      '/srv/app/public/admin/assets/index-a1B2c3D4.js',
      'C:\\srv\\app\\public\\chat\\assets\\chat-BlFpdtKJ.js',
    ]) {
      expect(frontendCacheControl(file)).toBe(IMMUTABLE_CACHE_CONTROL);
    }
  });

  it('入口页与不带哈希的文件每次协商，发版后立即生效', () => {
    for (const file of [
      '/srv/app/public/chat/index.html',
      '/srv/app/public/chat/favicon.ico',
      '/srv/app/public/chat/robots.txt',
      '/srv/app/public/chat/vendor/cmaps/UniGB-UCS2-H.bcmap',
      '/srv/app/public/chat/vendor/wasm/openjpeg.wasm',
      // public/images 原样拷贝的图片：不带哈希，文件名里的单词不能被当成哈希
      '/srv/app/public/chat/images/gongan-icon.png',
      '/srv/app/public/chat/images/chat-background.png',
      '/srv/app/public/chat/images/app-icon-maskable.png',
      '/srv/app/public/admin/index.html',
    ]) {
      expect(frontendCacheControl(file)).toBe(REVALIDATE_CACHE_CONTROL);
    }
  });
});
