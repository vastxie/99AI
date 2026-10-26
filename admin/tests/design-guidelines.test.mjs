import assert from 'node:assert/strict';
import test from 'node:test';

const { checkConfigAutoSaveOwnership } = await import('../scripts/check-design-guidelines.mjs');

function rulesOf(source, relPath = 'admin/src/views/system/example.vue') {
  const problems = [];
  checkConfigAutoSaveOwnership(source, relPath, problems);
  return problems.map((problem) => problem.rule).sort();
}

test('没告诉 composable 界面在哪：不传参数、只传 read 都算违规', () => {
  assert.deepEqual(rulesOf('const a = useConfigAutoSave();'), ['autosave-ui-target']);
  assert.deepEqual(rulesOf('const a = useConfigAutoSave({ read: (k) => form[k] });'), [
    'autosave-ui-target',
  ]);
});

test('传 form（含简写、带 codecs 的多行对象）或同时传 read / write 都通过', () => {
  assert.deepEqual(rulesOf('const a = useConfigAutoSave({ form });'), []);
  assert.deepEqual(rulesOf('const a = useConfigAutoSave({ form: formInline });'), []);
  assert.deepEqual(
    rulesOf(`const a = useConfigAutoSave({
      form: formInline,
      codecs: { list: { toRaw: (v) => JSON.stringify(v), fromRaw: (r) => (r ? JSON.parse(r) : []) } },
    });`),
    [],
  );
  assert.deepEqual(
    rulesOf(`const a = useConfigAutoSave({
      read: (key) => state[key],
      write: (key, raw) => { state[key] = raw; },
    });`),
    [],
  );
});

test('用了 useConfigAutoSave 的页面不得直接 setConfig（不论是否传 form）', () => {
  assert.deepEqual(
    rulesOf('const a = useConfigAutoSave({ form });\nawait apiConfig.setConfig({ settings });'),
    ['autosave-single-writer'],
  );
  assert.deepEqual(
    rulesOf(
      'const a = useConfigAutoSave({ read: (k) => s[k], write: (k, r) => {} });\napiConfig.setConfig(x);',
    ),
    ['autosave-single-writer'],
  );
});

test('没用 useConfigAutoSave 的文件不检查；登录配置页签必须传 form', () => {
  assert.deepEqual(rulesOf('await apiConfig.setConfig({ settings });'), []);
  assert.deepEqual(
    rulesOf(
      'const a = useConfigAutoSave({ read: (k) => s[k], write: (k, r) => {} });',
      'admin/src/packs/email/LoginConfigTab.vue',
    ),
    ['login-tab-autosave-form'],
  );
  assert.deepEqual(
    rulesOf(
      'const a = useConfigAutoSave({ form: formInline });',
      'admin/src/views/channel/login.vue',
    ),
    [],
  );
});

test('字符串里的括号不影响取实参', () => {
  assert.deepEqual(
    rulesOf(
      "const a = useConfigAutoSave({ form, codecs: { k: { toRaw: () => ')', fromRaw: (r) => r } } });",
    ),
    [],
  );
});
