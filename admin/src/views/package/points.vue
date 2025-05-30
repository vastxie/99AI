<route lang="yaml">
meta:
  title: 显示设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { QuestionFilled } from '@element-plus/icons-vue';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { onMounted, reactive, ref } from 'vue';

  const formInline = reactive({
    isHideModel3Point: '',
    isHideModel4Point: '',
    isHideDrawMjPoint: '',
    isHideDefaultPreset: '',
    model3Name: '',
    model4Name: '',
    drawMjName: '',
    showWatermark: '',
    isHideTts: '1',
    pluginFirst: '1',
    isHidePlugin: '0',
    showCrami: '0',
    clearCacheEnabled: '0',
    streamCacheEnabled: '0',
    homeWelcomeContent: '',
    enableHtmlRender: '0',
  });
  const rules = ref<FormRules>({
    model3Name: [{ required: true, message: '请输入普通积分名称', trigger: 'blur' }],
    model4Name: [{ required: true, message: '请输入高级积分名称', trigger: 'blur' }],
    drawMjName: [{ required: true, message: '请输入绘画积分名称', trigger: 'blur' }],
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
        'showWatermark',
        'isHideTts',
        'pluginFirst',
        'isHidePlugin',
        'showCrami',
        'clearCacheEnabled',
        'streamCacheEnabled',
        'homeWelcomeContent',
        'enableHtmlRender',
      ],
    });
    Object.assign(formInline, res.data);
  }

  function handlerUpdateConfig() {
    formRef.value?.validate(async (valid) => {
      if (valid) {
        try {
          await apiConfig.setConfig({ settings: formatSetting(formInline) });
          ElMessage.success('变更配置信息成功');
        } catch (error) {}
        queryAllconfig();
      } else {
        ElMessage.error('请填写完整信息');
      }
    });
  }

  function formatSetting(settings: any) {
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
          <div>
            网站显示配置用于控制用户界面的各种元素和功能展示，包括积分显示、菜单选项、功能按钮等。
          </div>
          <div>合理配置这些选项可以优化用户体验，简化界面，突出核心功能。</div>
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="150px">
        <h3 class="font-bold text-lg mb-4">性能与缓存设置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="清除缓存" prop="clearCacheEnabled">
              <el-switch
                v-model="formInline.clearCacheEnabled"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，将启用缓存清除功能，有助于解决页面数据显示异常问题</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="流式对话缓存" prop="streamCacheEnabled">
              <el-switch
                v-model="formInline.streamCacheEnabled"
                active-value="1"
                inactive-value="0"
              />

              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>
                      开启后，会对 AI 对话进行缓存输出，优化输出平滑性。关闭则完全依赖 API 流式输出
                    </p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">功能与界面设置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="显示全局水印" prop="showWatermark">
              <el-switch v-model="formInline.showWatermark" active-value="1" inactive-value="0" />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后将在对话页面显示用户名水印，增强内容安全性</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="渲染HTML内容" prop="enableHtmlRender">
              <el-switch
                v-model="formInline.enableHtmlRender"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，允许在用户内容中渲染HTML标签，但可能影响页面样式，建议按需开启</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏首页默认预设" prop="isHideDefaultPreset">
              <el-switch
                v-model="formInline.isHideDefaultPreset"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，首页将不显示默认预设提示，使界面更简洁</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏朗读按钮" prop="isHideTts">
              <el-switch v-model="formInline.isHideTts" active-value="1" inactive-value="0" />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，用户界面将不显示文本朗读按钮，可简化界面</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="首页欢迎提示" prop="homeWelcomeContent">
              <el-input
                v-model="formInline.homeWelcomeContent"
                type="text"
                placeholder="请输入首页欢迎提示内容，将在用户首次访问时显示"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">积分显示设置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏普通积分" prop="isHideModel3Point">
              <el-switch
                v-model="formInline.isHideModel3Point"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="普通积分名称" prop="model3Name">
              <el-input v-model="formInline.model3Name" placeholder="普通积分名称" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏高级积分" prop="isHideModel4Point">
              <el-switch
                v-model="formInline.isHideModel4Point"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="高级积分名称" prop="model4Name">
              <el-input v-model="formInline.model4Name" placeholder="高级积分名称" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏绘画积分" prop="isHideDrawMjPoint">
              <el-switch
                v-model="formInline.isHideDrawMjPoint"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="绘画积分名称" prop="drawMjName">
              <el-input v-model="formInline.drawMjName" placeholder="绘画积分名称" clearable />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
