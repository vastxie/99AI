import assert from 'node:assert/strict';
import { register } from 'node:module';
import test, { beforeEach } from 'node:test';

/** 替身：element-plus 只记录弹出的提示；请求层把 setConfig 交给测试控制 */
const stubs = {
  'element-plus': `
    const push = (type) => (message) => globalThis.__configAutoSaveTest.messages.push({ type, message });
    export const ElMessage = Object.assign((options) => push(options?.type)(options?.message), {
      success: push('success'),
      error: push('error'),
      warning: push('warning'),
      info: push('info'),
    });
  `,
  '@/api/modules/config': `
    export default {
      setConfig: (payload) => globalThis.__configAutoSaveTest.setConfig(payload),
      queryConfig: () => Promise.resolve({ data: {} }),
      queryAllConfig: () => Promise.resolve({ data: {} }),
    };
  `,
};

// 生产构建的 vue 不会因为 onBeforeUnmount 在组件外调用而打印警告
process.env.NODE_ENV = 'production';
register('./helpers/module-hooks.mjs', { parentURL: import.meta.url, data: { stubs } });
const { default: useConfigAutoSave, numberConfigCodec } =
  await import('../src/utils/composables/useConfigAutoSave.ts');
const { parseEnabledLanguages, useLanguageSettings } =
  await import('../src/views/system/languageSettings.ts');
const { nextTick, reactive } = await import('vue');

const state = { messages: [], requests: [], setConfig: null };
globalThis.__configAutoSaveTest = state;

beforeEach(() => {
  state.messages.length = 0;
  state.requests.length = 0;
  state.setConfig = async (payload) => {
    state.requests.push(payload);
  };
});

function readyAutoSave(form, originals = form) {
  const autoSave = useConfigAutoSave({ form });
  autoSave.initFromConfig({ ...originals });
  return autoSave;
}

test('配置未加载完成时 saveField 静默丢弃：不发请求、不提示、不改表单', async () => {
  const form = { siteName: 'typed' };
  const autoSave = useConfigAutoSave({ form });
  assert.equal(await autoSave.saveField('siteName', 'new'), false);
  assert.deepEqual(state.requests, []);
  assert.deepEqual(state.messages, []);
  assert.equal(form.siteName, 'typed');
});

test('保存成功：请求携带去空格后的值，表单与基准值回写，成功提示并触发 onSaved', async () => {
  const form = { siteName: 'old' };
  const autoSave = readyAutoSave(form);
  let saved = 0;
  // 表单经 v-model 已是输入的值：保存成功后回写去空格后的值
  form.siteName = '  new name  ';
  assert.equal(
    await autoSave.saveField('siteName', '  new name  ', { onSaved: () => saved++ }),
    true,
  );
  assert.deepEqual(state.requests, [
    { settings: [{ configKey: 'siteName', configVal: 'new name' }] },
  ]);
  assert.equal(form.siteName, 'new name');
  assert.equal(autoSave.originalValues.siteName, 'new name');
  assert.equal(saved, 1);
  assert.deepEqual(state.messages, [{ type: 'success', message: '保存成功' }]);
});

test('保存失败：表单回滚到保存前的原值，基准值不变，不触发 onSaved，也不再重复弹错（拦截器已提示）', async () => {
  const form = { siteName: 'old' };
  const autoSave = readyAutoSave(form);
  state.setConfig = async () => {
    throw new Error('network');
  };
  form.siteName = 'typed';
  let saved = 0;
  assert.equal(await autoSave.saveField('siteName', 'typed', { onSaved: () => saved++ }), false);
  assert.equal(form.siteName, 'old');
  assert.equal(autoSave.originalValues.siteName, 'old');
  assert.equal(saved, 0);
  assert.deepEqual(state.messages, []);
});

test('值未变化（仅前后空格不同）：不发请求，视为成功，并把去空格后的值回写表单', async () => {
  const form = { siteName: 'same' };
  const autoSave = readyAutoSave(form);
  form.siteName = ' same ';
  assert.equal(await autoSave.saveField('siteName', ' same '), true);
  assert.deepEqual(state.requests, []);
  assert.deepEqual(state.messages, []);
  assert.equal(form.siteName, 'same');
});

test('不传 form 时只维护基准值，不触碰任何表单对象', async () => {
  const autoSave = useConfigAutoSave();
  autoSave.initFromConfig({ siteName: 'old' });
  assert.equal(await autoSave.saveField('siteName', 'new'), true);
  assert.equal(autoSave.originalValues.siteName, 'new');
  state.setConfig = async () => {
    throw new Error('network');
  };
  assert.equal(await autoSave.saveField('siteName', 'again'), false);
  assert.equal(autoSave.originalValues.siteName, 'new');
});

test('saveFields：未加载完成时提示并放弃；成功后同步全部基准值', async () => {
  const autoSave = useConfigAutoSave();
  assert.equal(await autoSave.saveFields({ a: '1' }), false);
  assert.deepEqual(state.messages, [
    { type: 'warning', message: '配置尚未加载完成，本次修改未保存' },
  ]);
  assert.deepEqual(state.requests, []);

  autoSave.initFromConfig({ a: '0', b: '0' });
  assert.equal(await autoSave.saveFields({ a: '1', b: '2' }), true);
  assert.deepEqual(state.requests, [
    {
      settings: [
        { configKey: 'a', configVal: '1' },
        { configKey: 'b', configVal: '2' },
      ],
    },
  ]);
  assert.equal(autoSave.originalValues.a, '1');
  assert.equal(autoSave.originalValues.b, '2');
});

function deferredRequest() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('onSaved 拿到这次保存成功的值；用户已改成别的内容时不回写表单', async () => {
  const form = { siteName: 'old' };
  const autoSave = readyAutoSave(form);
  const pending = deferredRequest();
  state.setConfig = (payload) => {
    state.requests.push(payload);
    return pending.promise;
  };
  form.siteName = 'A';
  let savedSnapshot = null;
  const saving = autoSave.saveField('siteName', 'A', {
    onSaved: (saved) => {
      savedSnapshot = saved;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(autoSave.saving('siteName'), true);
  form.siteName = 'B';
  pending.resolve();
  assert.equal(await saving, true);
  assert.deepEqual(savedSnapshot, { siteName: 'A' });
  assert.equal(form.siteName, 'B');
  assert.equal(autoSave.originalValues.siteName, 'A');
  assert.equal(autoSave.saving('siteName'), false);
});

test('数值字段经 codec：请求发字符串，失败回滚成数字', async () => {
  const form = { limit: 25 };
  const autoSave = useConfigAutoSave({ form, codecs: { limit: numberConfigCodec(25) } });
  autoSave.initFromConfig({ limit: '' });
  state.setConfig = async (payload) => {
    state.requests.push(payload);
    throw new Error('network');
  };
  form.limit = 30;
  assert.equal(await autoSave.saveField('limit', 30), false);
  assert.deepEqual(state.requests, [{ settings: [{ configKey: 'limit', configVal: '30' }] }]);
  // 已确认值是空串（没配置过）：回到页面加载时的默认值
  assert.equal(form.limit, 25);
});

test('read / write：界面不是扁平表单时按原始字符串写回（例如 JSON 数组）', async () => {
  const ui = { list: ['a'] };
  const autoSave = useConfigAutoSave({
    read: (key) => JSON.stringify(ui[key]),
    write: (key, raw) => {
      ui[key] = raw ? JSON.parse(raw) : [];
    },
  });
  autoSave.initFromConfig({ list: '["a"]' });
  state.setConfig = async () => {
    throw new Error('network');
  };
  ui.list = ['a', 'b'];
  assert.equal(await autoSave.saveField('list', JSON.stringify(ui.list)), false);
  assert.deepEqual(ui.list, ['a']);
});

test('saveFields 成组：一次请求，失败整组回滚，成功用指定的提示', async () => {
  const form = { a: '1', b: '0' };
  const autoSave = readyAutoSave(form);
  form.a = '0';
  form.b = '1';
  state.setConfig = async (payload) => {
    state.requests.push(payload);
    throw new Error('network');
  };
  assert.equal(await autoSave.saveFields({ a: '0', b: '1' }), false);
  assert.equal(state.requests.length, 1);
  assert.deepEqual(form, { a: '1', b: '0' });

  state.setConfig = async (payload) => {
    state.requests.push(payload);
  };
  form.a = '0';
  form.b = '1';
  assert.equal(await autoSave.saveFields({ a: '0', b: '1' }, { successMessage: '已切换' }), true);
  assert.deepEqual(state.messages.at(-1), { type: 'success', message: '已切换' });
});

test('数组字段经 codec 读界面值：失败时按 JSON 比对并回滚成数组', async () => {
  const form = { list: ['a'] };
  const autoSave = useConfigAutoSave({
    form,
    codecs: {
      list: {
        toRaw: (value) => JSON.stringify(value),
        fromRaw: (raw) => (raw ? JSON.parse(raw) : []),
      },
    },
  });
  autoSave.initFromConfig({ list: '["a"]' });
  state.setConfig = async () => {
    throw new Error('network');
  };
  form.list = ['a', 'b'];
  assert.equal(await autoSave.saveField('list', form.list), false);
  assert.deepEqual(form.list, ['a']);
});

test('saveFields 是成组保存：与已确认值相同也整组发出（不按单项跳过）', async () => {
  const form = { a: '1', b: '2' };
  const autoSave = readyAutoSave(form);
  assert.equal(await autoSave.saveFields({ a: '1', b: '2' }), true);
  assert.deepEqual(state.requests, [
    {
      settings: [
        { configKey: 'a', configVal: '1' },
        { configKey: 'b', configVal: '2' },
      ],
    },
  ]);
});

/** 显示设置页的语言部分：真实的自动保存 + 语言设置接线，请求由测试逐个放行 */
function languagePage(confirmed) {
  const form = reactive({
    enabledLanguages: parseEnabledLanguages(confirmed.enabledLanguages),
    defaultLanguage: confirmed.defaultLanguage,
  });
  const autoSave = useConfigAutoSave({
    form,
    codecs: {
      enabledLanguages: {
        toRaw: (value) => JSON.stringify(parseEnabledLanguages(value)),
        fromRaw: (raw) => parseEnabledLanguages(raw),
      },
    },
  });
  autoSave.initFromConfig({ ...confirmed });
  const settings = useLanguageSettings(form, autoSave);
  const pending = [];
  state.setConfig = (payload) => {
    state.requests.push(payload);
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  };
  /** 模拟 Element Plus：先更新 v-model，下一个 tick（watch 已运行）才触发 change */
  async function toggle(list) {
    form.enabledLanguages = list;
    await nextTick();
    return settings.onEnabledLanguagesChange(list);
  }
  async function pick(language) {
    form.defaultLanguage = language;
    await nextTick();
    return settings.onDefaultLanguageChange();
  }
  const settle = async (ok) => {
    const request = pending.shift();
    if (ok) request.resolve();
    else request.reject(new Error('network'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const lastSaved = () =>
    Object.fromEntries(
      state.requests.at(-1).settings.map((item) => [item.configKey, item.configVal]),
    );
  return { form, toggle, pick, settle, lastSaved };
}

test('语言：保存「仅英文」在途时清空语言集合，界面回到这次在途的意图，请求成功后与后台一致', async () => {
  const page = languagePage({ enabledLanguages: '["zh-CN","en-US"]', defaultLanguage: 'zh-CN' });
  const first = page.toggle(['en-US']);
  await nextTick();
  assert.deepEqual(page.lastSaved(), { enabledLanguages: '["en-US"]', defaultLanguage: 'en-US' });
  assert.equal(await page.toggle([]), false);
  assert.deepEqual(state.messages.at(-1), { type: 'warning', message: '请至少保留一种语言' });
  assert.deepEqual([...page.form.enabledLanguages], ['en-US']);
  assert.equal(page.form.defaultLanguage, 'en-US');
  await page.settle(true);
  assert.equal(await first, true);
  assert.equal(state.requests.length, 1);
  assert.deepEqual([...page.form.enabledLanguages], ['en-US']);
  assert.equal(page.form.defaultLanguage, 'en-US');
});

test('语言：默认语言与语言集合成组保存，中间一次失败不会留下「仅英文、默认中文」', async () => {
  const page = languagePage({ enabledLanguages: '["zh-CN","en-US"]', defaultLanguage: 'zh-CN' });
  const onlyEnglish = page.toggle(['en-US']);
  await nextTick();
  await page.settle(true);
  assert.equal(await onlyEnglish, true);

  const addChinese = page.toggle(['en-US', 'zh-CN']);
  await nextTick();
  const pickChinese = page.pick('zh-CN');
  await page.settle(false);
  assert.equal(await addChinese, false);
  // 失败的那次两项都被后面排队的保存覆盖：界面不回滚
  assert.deepEqual([...page.form.enabledLanguages], ['en-US', 'zh-CN']);
  assert.equal(page.form.defaultLanguage, 'zh-CN');
  assert.deepEqual(page.lastSaved(), {
    enabledLanguages: '["en-US","zh-CN"]',
    defaultLanguage: 'zh-CN',
  });
  await page.settle(true);
  assert.equal(await pickChinese, true);
  assert.deepEqual([...page.form.enabledLanguages], ['en-US', 'zh-CN']);
  assert.equal(page.form.defaultLanguage, 'zh-CN');
});

test('语言：成组保存最后一次也失败时，界面两项一起回到后台的值', async () => {
  const page = languagePage({ enabledLanguages: '["en-US"]', defaultLanguage: 'en-US' });
  const addChinese = page.toggle(['en-US', 'zh-CN']);
  await nextTick();
  const pickChinese = page.pick('zh-CN');
  await page.settle(false);
  await page.settle(false);
  assert.equal(await addChinese, false);
  assert.equal(await pickChinese, false);
  assert.deepEqual([...page.form.enabledLanguages], ['en-US']);
  assert.equal(page.form.defaultLanguage, 'en-US');
});

test('语言：后台还没有语言配置时清空语言集合，界面回到全部语言、默认第一个', async () => {
  const page = languagePage({ enabledLanguages: '', defaultLanguage: '' });
  assert.equal(await page.toggle([]), false);
  assert.deepEqual([...page.form.enabledLanguages], ['zh-CN', 'en-US']);
  assert.equal(page.form.defaultLanguage, 'zh-CN');
  assert.equal(state.requests.length, 0);
});
