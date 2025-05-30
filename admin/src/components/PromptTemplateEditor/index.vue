<script setup lang="ts">
  import { Delete, Plus, Rank } from '@element-plus/icons-vue';
  import { ElMessage } from 'element-plus';
  import { v4 as uuidv4 } from 'uuid';
  import { computed, ref } from 'vue';
  import draggable from 'vuedraggable';

  // 定义字段类型接口
  interface TemplateField {
    id: string;
    title: string;
    type: 'input' | 'select';
    placeholder: string;
    options?: string[];
  }

  // 定义 Props 和 Emits
  const props = defineProps<{
    modelValue: TemplateField[];
  }>();

  const emit = defineEmits<{
    (e: 'update:modelValue', value: TemplateField[]): void;
  }>();

  // 本地状态，避免直接修改 prop
  const localFields = ref<TemplateField[]>([]);

  // 使用计算属性同步 prop 和本地状态
  const fields = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value),
  });

  // 监听外部 modelValue 变化，同步到本地（如果需要深度监听或特殊处理）
  // watch(() => props.modelValue, (newValue) => {
  //   // 可以添加深拷贝或其他逻辑
  //   localFields.value = JSON.parse(JSON.stringify(newValue));
  // }, { deep: true, immediate: true });

  // 添加新字段
  const addField = (type: 'input' | 'select' = 'input') => {
    fields.value = [
      ...fields.value,
      {
        id: uuidv4(),
        type,
        title: '',
        placeholder: '',
        options: type === 'select' ? [''] : undefined, // Select 默认带一个空选项
      },
    ];
  };

  // 删除字段
  const removeField = (id: string) => {
    fields.value = fields.value.filter((field) => field.id !== id);
  };

  // 添加选项（仅用于 select）
  const addOption = (fieldId: string) => {
    fields.value = fields.value.map((field) => {
      if (field.id === fieldId && field.type === 'select') {
        // 确保 options 数组存在
        const options = field.options ? [...field.options] : [];
        options.push(''); // 添加一个空选项
        return { ...field, options };
      }
      return field;
    });
  };

  // 删除选项（仅用于 select）
  const removeOption = (fieldId: string, optionIndex: number) => {
    fields.value = fields.value.map((field) => {
      if (field.id === fieldId && field.type === 'select' && field.options) {
        const options = [...field.options];
        if (options.length > 1) {
          // 至少保留一个选项输入框
          options.splice(optionIndex, 1);
          return { ...field, options };
        } else {
          ElMessage.warning('下拉框至少需要一个选项');
        }
      }
      return field;
    });
  };

  // 更新字段类型
  const updateFieldType = (id: string, newType: 'input' | 'select') => {
    fields.value = fields.value.map((field) => {
      if (field.id === id) {
        return {
          ...field,
          type: newType,
          // 从 input 转 select 时，添加默认 options
          options: newType === 'select' && !field.options ? [''] : field.options,
          // 从 select 转 input 时，移除 options (可选，也可保留)
          // options: newType === 'input' ? undefined : field.options,
        };
      }
      return field;
    });
  };

  // 更新选项值
  const updateOptionValue = (fieldId: string, optionIndex: number, value: string) => {
    fields.value = fields.value.map((field) => {
      if (field.id === fieldId && field.type === 'select' && field.options) {
        const options = [...field.options];
        options[optionIndex] = value;
        return { ...field, options };
      }
      return field;
    });
  };

  // 更新 Placeholder 值
  const updatePlaceholderValue = (fieldId: string, value: string) => {
    fields.value = fields.value.map((field) => {
      if (field.id === fieldId) {
        return { ...field, placeholder: value };
      }
      return field;
    });
  };

  // 更新 Title 值
  const updateTitleValue = (fieldId: string, value: string) => {
    fields.value = fields.value.map((field) => {
      if (field.id === fieldId) {
        return { ...field, title: value };
      }
      return field;
    });
  };

  // Draggable 配置
  const dragOptions = {
    animation: 200,
    ghostClass: 'ghost', // Class name for the drop placeholder
    handle: '.drag-handle', // Specify the handle element
  };
</script>

<template>
  <div class="prompt-template-editor">
    <!-- Use CSS Grid for layout -->
    <draggable v-model="fields" item-key="id" v-bind="dragOptions" tag="div" class="field-grid">
      <template #item="{ element: field, index }">
        <el-card shadow="never" class="field-item border border-gray-200 relative group">
          <div class="flex items-start space-x-3">
            <!-- Add Number Prefix -->
            <div class="field-number font-semibold text-gray-400 pt-2 mr-1">{{ index + 1 }}.</div>
            <!-- Drag Handle -->
            <div class="drag-handle cursor-move text-gray-400 hover:text-gray-600 pt-2">
              <el-icon :size="20"><Rank /></el-icon>
            </div>
            <!-- Field Content -->
            <div class="flex-grow">
              <el-form label-position="top" size="small">
                <div class="flex items-center mb-2 space-x-4">
                  <el-radio-group
                    :model-value="field.type"
                    @update:modelValue="
                      (newType) => updateFieldType(field.id, newType as 'input' | 'select')
                    "
                    size="small"
                  >
                    <el-radio-button label="input">输入框</el-radio-button>
                    <el-radio-button label="select">下拉框</el-radio-button>
                  </el-radio-group>
                  <el-button
                    type="danger"
                    :icon="Delete"
                    link
                    class="ml-auto !p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="removeField(field.id)"
                  />
                </div>
                <el-form-item label="字段名称 (Title / Label)">
                  <el-input
                    :model-value="field.title"
                    @update:modelValue="(val) => updateTitleValue(field.id, val)"
                    placeholder="例如：您的姓名"
                    clearable
                  />
                </el-form-item>
                <el-form-item label="提示文字 (Placeholder)">
                  <el-input
                    :model-value="field.placeholder"
                    @update:modelValue="(val) => updatePlaceholderValue(field.id, val)"
                    placeholder="例如：请输入您的姓名"
                    clearable
                  />
                </el-form-item>
                <div v-if="field.type === 'select'">
                  <el-form-item label="下拉选项">
                    <div class="space-y-2 w-full">
                      <div
                        v-for="(option, index) in field.options"
                        :key="index"
                        class="flex items-center space-x-2"
                      >
                        <el-input
                          :model-value="option"
                          @update:modelValue="(val) => updateOptionValue(field.id, index, val)"
                          placeholder="选项内容"
                          size="small"
                          clearable
                          class="flex-grow"
                        />
                        <el-button
                          :icon="Delete"
                          type="danger"
                          link
                          size="small"
                          class="!p-1"
                          :disabled="field.options && field.options.length <= 1"
                          @click="removeOption(field.id, index)"
                        />
                      </div>
                      <el-button
                        :icon="Plus"
                        type="primary"
                        link
                        size="small"
                        @click="addOption(field.id)"
                      >
                        添加选项
                      </el-button>
                    </div>
                  </el-form-item>
                </div>
              </el-form>
            </div>
          </div>
        </el-card>
      </template>
    </draggable>

    <div class="mt-4 flex justify-center space-x-2">
      <el-button :icon="Plus" type="primary" plain @click="addField('input')">添加输入框</el-button>
      <el-button :icon="Plus" type="success" plain @click="addField('select')"
        >添加下拉框</el-button
      >
    </div>
  </div>
</template>

<style scoped>
  .prompt-template-editor {
    padding: 5px;
  }

  .field-grid {
    /* Use Grid for layout */
    display: grid;
    /* grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); */ /* Try forcing 3 columns */
    grid-template-columns: repeat(3, 1fr); /* Force 3 columns */
    gap: 1rem;
    width: 100%;
  }

  .field-item {
    background-color: #fdfdfd;
    transition: box-shadow 0.2s ease-in-out;
    width: 100%; /* Ensure card takes full width of cell */
  }
  .field-item:hover {
    box-shadow: var(--el-box-shadow-lighter);
  }

  .drag-handle {
    touch-action: none;
  }

  .field-number {
    /* Style for number prefix */
    min-width: 20px;
    text-align: right;
  }

  .ghost {
    opacity: 0.5;
    background: #c8ebfb;
    border: 1px dashed #409eff;
  }

  :deep(.el-form-item__label) {
    line-height: normal;
    margin-bottom: 4px !important;
    padding: 0 !important;
  }
  :deep(.el-form-item) {
    margin-bottom: 10px;
  }
</style>
