<route lang="yaml">
meta:
  title: 积分显示
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const drawingStyleList = ref(); // 绘画风格关键词列表
const inputVisible = ref(false); // 控制输入框的显示
const inputValue = ref(''); // 输入框的值
const inputRef = ref(); // 输入框的引用

const formInline = reactive({
  isHideModel3Point: '',
  isHideModel4Point: '',
  isHideDrawMjPoint: '',
  isHideDefaultPreset: '',
  model3Name: '',
  model4Name: '',
  drawMjName: '',
  drawingStyles: '',
  showWatermark: '',
  isHideTts: '',
});
const rules = ref<FormRules>({
  model3Name: [
    { required: true, message: '请输入普通积分名称', trigger: 'blur' },
  ],
  model4Name: [
    { required: true, message: '请输入高级积分名称', trigger: 'blur' },
  ],
  drawMjName: [
    { required: true, message: '请输入绘画积分名称', trigger: 'blur' },
  ],
});
const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'isHideModel3Point',
      'isHideModel4Point',
      'isHideDrawMjPoint',
      'isHideDefaultPreset',
      'model3Name',
      'model4Name',
      'drawMjName',
      'drawingStyles',
      'showWatermark',
      'isHideTts',
    ],
  });
  Object.assign(formInline, res.data);
  if (res.data.drawingStyles) {
    drawingStyleList.value = res.data.drawingStyles.split(',');
  } else {
    drawingStyleList.value = []; // 确保drawingStyleList是一个空数组，如果没有drawingStyles数据
  }
}

// 显示输入框
function showInput() {
  inputVisible.value = true;
  // 等待下次 DOM 更新后聚焦输入框
  nextTick(() => {
    inputRef.value.focus();
  });
}

// 确认输入
function handleInputConfirm() {
  const value = inputValue.value.trim();
  if (value) {
    drawingStyleList.value.push(value);
  }
  inputVisible.value = false;
  inputValue.value = '';
}

// 移除关键词
function handleStyleRemove(index: any) {
  drawingStyleList.value.splice(index, 1);
}

// 初始化时从字符串解析关键词列表
function initDrawingStyles() {
  if (formInline.drawingStyles) {
    drawingStyleList.value = formInline.drawingStyles.split(',');
  }
}

function handlerUpdateConfig() {
  formInline.drawingStyles = drawingStyleList.value.join(',');
  formRef.value?.validate(async (valid) => {
    if (valid) {
      try {
        await apiConfig.setConfig({ settings: fotmatSetting(formInline) });
        ElMessage.success('变更配置信息成功');
      } catch (error) {}
      queryAllconfig();
    } else {
      ElMessage.error('请填写完整信息');
    }
  });
}

function fotmatSetting(settings: any) {
  return Object.keys(settings).map((key) => {
    return {
      configKey: key,
      configVal: settings[key],
    };
  });
}

onMounted(() => {
  queryAllconfig();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">网站显示配置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>网站显示配置用于控制，积分、侧边菜单、朗读按钮等显示设置。</div>
          <div>同时可以按需添加绘图风格标签。</div>
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form
        ref="formRef"
        :rules="rules"
        :model="formInline"
        label-width="150px"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏普通积分" prop="isHideModel3Point">
              <el-tooltip
                content="隐藏后用户端将不显示普通积分，用户仍可以通过地址栏访问页面！"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.isHideModel3Point"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="普通积分名称" prop="model3Name">
              <el-input
                v-model="formInline.model3Name"
                placeholder="普通积分名称"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏高级积分" prop="isHideModel4Point">
              <el-tooltip
                content="隐藏后用户端将不显示高级积分，用户仍可以通过地址栏访问页面！"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.isHideModel4Point"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="高级积分名称" prop="model4Name">
              <el-input
                v-model="formInline.model4Name"
                placeholder="高级积分名称"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏绘画积分" prop="isHideDrawMjPoint">
              <el-tooltip
                content="隐藏后用户端将不显示绘画积分，用户仍可以通过地址栏访问页面！"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.isHideDrawMjPoint"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="绘画积分名称" prop="drawMjName">
              <el-input
                v-model="formInline.drawMjName"
                placeholder="绘画积分名称"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="显示全局水印" prop="showWatermark">
              <el-tooltip
                content="开启后将在对话页显示用户名水印"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.showWatermark"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏首页默认预设" prop="isHideDefaultPreset">
              <el-tooltip
                content="隐藏后首页将不显示默认预设"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.isHideDefaultPreset"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏朗读按钮" prop="isHideTts">
              <el-tooltip
                content="隐藏后用户端将不显示朗读按钮"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.isHideTts"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row class="mt-2">
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="绘图风格显示" prop="drawingStyles">
              <div style="display: flex; flex-wrap: wrap; gap: 10px">
                <el-tag
                  v-for="(item, index) in drawingStyleList"
                  :key="index"
                  closable
                  style="margin-bottom: 10px"
                  @close="handleStyleRemove(index)"
                >
                  {{ item }}
                </el-tag>
                <el-input
                  v-if="inputVisible"
                  ref="inputRef"
                  v-model="inputValue"
                  size="small"
                  style="margin-left: 10px; width: auto; min-width: 80px"
                  @keyup.enter="handleInputConfirm"
                  @blur="handleInputConfirm"
                />
                <el-button
                  v-else
                  size="small"
                  style="margin-left: 10px"
                  @click="showInput"
                >
                  + 添加风格
                </el-button>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
