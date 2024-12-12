<route lang="yaml">
meta:
  title: 敏感词预设
</route>

<script lang="ts" setup>
import ApiBadWords from '@/api/modules/badWords';
import type { FormInstance } from 'element-plus';
import { ElInput, ElMessage } from 'element-plus';
import { onMounted, reactive } from 'vue';

import { ENABLE_STATUS_OPTIONS } from '@/constants/index';
import useSettingsStore from '@/store/modules/settings';

const settingsStore = useSettingsStore();
const formRef = ref<FormInstance>();
const total = ref(0);
const loading = ref(false);

const formInline = reactive({
  word: '',
  status: '',
  page: 1,
  size: 500,
});

// const theme = computed(() => {
//   return settingsStore.settings.app.colorScheme;
// });
const badWordList = ref();

async function queryBadWordList() {
  try {
    loading.value = true;
    const res = await ApiBadWords.queryBadWords(formInline);
    const { rows, count } = res.data;
    loading.value = false;
    total.value = count;
    badWordList.value = rows;
  } catch (error) {
    loading.value = false;
  }
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryBadWordList();
}
onMounted(() => {
  queryBadWordList();
});

const inputValue = ref('');
const inputVisible = ref(false);
const InputRef = ref<InstanceType<typeof ElInput>>();

async function handleDel(id: number) {
  await ApiBadWords.delBadWords({ id });
  ElMessage.success('删除敏感词成功');
  await queryBadWordList();
}

function showInput() {
  inputVisible.value = true;
  nextTick(() => {
    InputRef.value!.input!.focus();
  });
}

async function handleInputConfirm() {
  if (inputValue.value) {
    await ApiBadWords.addBadWords({ word: inputValue.value });
    ElMessage.success('添加敏感词成功');
    formInline.status = '';
    await queryBadWordList();
  }
  inputVisible.value = false;
  inputValue.value = '';
}
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">自定义敏感词</div>
      </template>
      <!-- <template #content>
        <div class="text-sm/6">
          <div>
            触发敏感词将自动拦截，如配置过三方平台、自定义检测将在三方平台通过后最后进行检测！
          </div>
        </div>
      </template> -->
    </PageHeader>

    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="敏感词" prop="word">
          <ElInput
            v-model="formInline.word"
            placeholder="敏感词[模糊搜索]"
            @keydown.enter.prevent="queryBadWordList"
          />
        </el-form-item>

        <el-form-item label="敏感词状态" prop="status">
          <el-select
            v-model="formInline.status"
            placeholder="请选择敏感词状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in ENABLE_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryBadWordList"> 查询 </el-button>
          <el-button @click="handlerReset(formRef)"> 重置 </el-button>
        </el-form-item>
      </el-form>
    </page-main>

    <page-main v-loading="loading" style="width: 100%">
      <el-tag
        v-for="item in badWordList"
        :key="item.id"
        type="warning"
        class="mb-3 mr-3"
        closable
        hit
        :disable-transitions="true"
        @close="handleDel(item.id)"
      >
        {{ item.word }}
      </el-tag>
      <ElInput
        v-if="inputVisible"
        ref="InputRef"
        v-model="inputValue"
        class="ml-1"
        style="width: 80px"
        size="small"
        @keyup.enter="handleInputConfirm"
        @blur="handleInputConfirm"
      />
      <el-button v-else class="ml-1" size="small" @click="showInput">
        + New Word
      </el-button>
    </page-main>
  </div>
</template>
