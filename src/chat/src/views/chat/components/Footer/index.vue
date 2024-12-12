<script setup lang="ts">
import { fetchQueryOneCatAPI, fetchSearchAppsAPI } from '@/api/appStore';
import { fetchUpdateGroupAPI } from '@/api/group';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import {
  Close,
  Link,
  LoadingFour,
  SendOne,
  ShuffleOne,
  Square,
} from '@icon-park/vue-next';
import axios from 'axios';
// import mammoth from 'mammoth';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
// import * as pdfjsLib from 'pdfjs-dist';
// import { getDocument } from 'pdfjs-dist';
import { computed, inject, nextTick, onMounted, Ref, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { createLoadingTask } from 'vue3-pdfjs';

interface Emit {
  (ev: 'pause-request'): void;
}

// 引入依赖
const onConversation = inject<any>('onConversation');
const route = useRoute();
// 引用的 store
const useGlobalStore = useGlobalStoreWithOut();
const authStore = useAuthStore();
const chatStore = useChatStore();
const emit = defineEmits<Emit>();

// 初始化变量
const mjSizes = ref([
  {
    id: 'square',
    title: t('chat.square1'),
    values: '1:1',
    aspectRatio: '1 / 1',
  },
  {
    id: 'illustration',
    title: t('chat.illustration'),
    values: '4:3',
    aspectRatio: '4 / 3',
  },
  {
    id: 'wallpaper',
    title: t('chat.wallpaper'),
    values: '16:9',
    aspectRatio: '16 / 9',
  },
  {
    id: 'media',
    title: t('chat.media'),
    values: '3:4',
    aspectRatio: '3 / 4',
  },
  {
    id: 'poster',
    title: t('chat.poster'),
    values: '9:16',
    aspectRatio: '9 / 16',
  },
]);

const mjVersions = ref([
  {
    title: '6.1',
    values: '--v 6.1',
  },
  {
    title: '5.2',
    values: '--v 5.2',
  },
  {
    title: '卡通',
    values: '--niji 6',
  },
]);
const mjUrl = ref([
  {
    title: t('chat.imageToImage'), // 图生图
    values: 'imageToImage',
  },
  {
    title: t('chat.faceConsistency'), // 人脸一致
    values: 'faceConsistency',
  },
  {
    title: t('chat.styleConsistency'), // 风格一致
    values: 'styleConsistency',
  },
  {
    title: '以图生文', // 文生图
    values: 'imageToText',
  },
]);
const sizes = ref([
  {
    id: 'default',
    title: t('chat.square'),
    values: '1024x1024',
    aspectRatio: '1024 / 1024',
  },
  {
    id: 'landscape',
    title: t('chat.landscape'),
    values: '1792x1024',
    aspectRatio: '1792 / 1024',
  },
  {
    id: 'portrait',
    title: t('chat.portrait'),
    values: '1024x1792',
    aspectRatio: '1024 / 1792',
  },
]);
// const isStreamIn = ref(false);
const showDeleteIcon = ref(false);
const isFile = ref(true);
const fileInput = ref();
const isUploading = ref(false);
const searchResults = ref<any[]>([]);
const initialHeight = '1.5rem';
const isPdfRoute = computed(() => route.path === '/pdf');
const inputRef = ref<Ref | null>(null);
const extraParam = ref({ size: '', style: '' });
const mjUrlParam = ref();
const mjVersionsParam = ref('--v 6.1');
const randomStyles = ref<string[]>([]);
const selectedSize = ref(sizes.value[0]);
const selectedMjUrl = ref(mjUrl.value[0]);
const selectedMjVersion = ref(mjVersions.value[0]);
const customWidth = ref('');
const customHeight = ref('');
const customAspectRatio = ref('');
const showSuggestions = ref(false);
const selectedApp = ref();
const isSelectedApp = ref(false);
let searchTimeout: string | number | NodeJS.Timeout | null | undefined = null;

// 计算属性
// 双向绑定 chatStore.prompt
const prompt = computed({
  get: () => chatStore.prompt,
  set: (value) => {
    chatStore.setPrompt(value);
  },
});
const globaelConfig = computed(() => authStore.globalConfig);
const isSetBeian = computed(
  () => globaelConfig.value?.companyName && globaelConfig.value?.filingNumber
);
const { isMobile } = useBasicLayout();
const usingPlugin = computed(() => chatStore.currentPlugin);
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false;
});
const dataSources = computed(() => chatStore.chatList);
const uploadUrl = ref(`${import.meta.env.VITE_GLOB_API_URL}/upload/file`);
const activeModelName = computed(() =>
  String(configObj?.value.modelInfo.modelName)
);
const activeModelKeyType = computed(() =>
  Number(configObj?.value.modelInfo.keyType)
);

const activeGroupId = computed(() => chatStore.active);
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo());
const configObj = computed(() => {
  const configString = activeGroupInfo.value?.config;
  if (!configString) {
    return {}; // 提早返回一个空对象
  }

  try {
    return JSON.parse(configString);
  } catch (e) {
    return {}; // 解析失败时返回一个空对象
  }
});
const fileParsing = computed(() =>
  String(configObj?.value?.fileInfo?.fileParsing || '')
);
const fileName = computed(() =>
  String(configObj?.value?.fileInfo?.fileName || '')
);
const activeModel = computed(() =>
  String(configObj?.value?.modelInfo?.model ?? '')
);
const activeModelFileUpload = computed(() =>
  Number(configObj?.value?.modelInfo?.isFileUpload)
);
const isFilesModel = computed(() =>
  [1, 2, 3].includes(activeModelFileUpload.value)
);
const isDalleModel = computed(
  () =>
    activeModel.value === 'dall-e-3' ||
    usingPlugin.value?.parameters === 'dall-e-3'
);

const isFluxModel = computed(
  () =>
    activeModel.value.includes('flux') ||
    usingPlugin.value?.parameters.includes('flux')
);
const isMidjourneyModel = computed(
  () =>
    activeModel.value === 'midjourney' ||
    usingPlugin.value?.parameters === 'midjourney'
);

const isPptModel = computed(
  () =>
    activeModel.value === 'ai-ppt' || usingPlugin.value?.parameters === 'ai-ppt'
);

const isLumaVideoModel = computed(
  () =>
    activeModel.value === 'luma-video' ||
    usingPlugin.value?.parameters === 'luma-video'
);

const isCogViewModel = computed(
  () =>
    activeModel.value === 'cog-video' ||
    usingPlugin.value?.parameters === 'cog-video'
);

const clipboardText = computed(() => useGlobalStore.clipboardText);
const placeholder = computed(() =>
  isMobile.value ? t('chat.placeholderMobile') : t('chat.placeholder')
);
const buttonDisabled = computed(
  () =>
    isStreamIn.value ||
    ((!prompt.value || prompt.value.trim() === '') &&
      !(dataBase64List.value.length > 0))
);

const getAspectRatioStyle = (aspectRatioString: any, fixedSize = 16) => {
  const [height, width] = aspectRatioString.split(' / ').map(Number);
  const aspectRatio = height / width;

  // 当宽度大于高度时，固定高度，动态调整宽度
  if (width > height) {
    return {
      width: `${fixedSize * aspectRatio}px`, // 宽度根据比例动态调整
      height: `${fixedSize}px`, // 固定高度
    };
  }
  // 当高度大于或等于宽度时，固定宽度，动态调整高度
  else {
    return {
      width: `${fixedSize}px`, // 固定宽度
      height: `${fixedSize / aspectRatio}px`, // 高度根据比例动态调整
    };
  }
};

const switchSize = (option: any) => {
  if (option.id === 'custom') {
    const customRatio = `${customWidth.value}:${customHeight.value}`;
    selectedSize.value = {
      ...option,
      values: customRatio,
      aspectRatio: `${customWidth.value} / ${customHeight.value}`,
    };
    extraParam.value.size = customRatio;
  } else {
    selectedSize.value = option;
    extraParam.value.size = option.values;
  }
};

const switchMjVersion = (option: any) => {
  selectedMjVersion.value = option;
  mjVersionsParam.value = option.values;
};

const switchMjUrl = (option: any) => {
  if (!(dataBase64List.value.length > 0)) {
    triggerFileUpload();
  }
  selectedMjUrl.value = option;
  mjUrlParam.value = option.values;
};

// 自动调整高度
const autoResize = () => {
  if (inputRef.value) {
    const textarea = inputRef.value;
    const maxLines = 8; // 最大行数
    const initialHeight = '1.5rem'; // 初始高度
    textarea.style.height = initialHeight; // 重置高度

    // 计算实际行数
    const lines = prompt.value.split('\n').reduce((totalLines, line) => {
      const maxCharsPerLine = Math.floor(textarea.clientWidth / 8); // 假设每字符宽度为 8px
      return totalLines + Math.ceil(line.length / maxCharsPerLine);
    }, 0);

    // 动态获取行高
    const singleLineHeight =
      parseFloat(window.getComputedStyle(textarea).lineHeight) || 20; // 默认行高 20px
    const maxHeight = singleLineHeight * maxLines; // 最大高度

    // 设置高度
    const contentHeight = singleLineHeight * lines;
    textarea.style.height = Math.min(contentHeight, maxHeight) + 'px';
  }
};

// 监听 prompt 的变化（外部修改时调整高度）
watch(
  prompt,
  () => {
    nextTick(() => {
      autoResize();
    });
  },
  { immediate: true } // 初始化时立即调整
);

const handleInput = async (event: KeyboardEvent) => {
  const inputElement = event.target as HTMLTextAreaElement;
  const inputValue = inputElement.value;
  showSuggestions.value = inputValue.startsWith('@');

  // 清除之前的定时器，如果有的话
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (showSuggestions.value && !isSelectedApp.value) {
    const searchTerm = inputValue.slice(1); // 去掉'@'
    // 使用定时器来节流搜索请求
    searchTimeout = setTimeout(async () => {
      if (searchTerm.length > 0) {
        try {
          const results: any = await fetchSearchAppsAPI({
            keyword: searchTerm,
          });
          searchResults.value = results.data.rows;
        } catch (error) {
          console.error('Error fetching search results:', error);
          searchResults.value = [];
        }
      } else {
        searchResults.value = [];
      }
    }, 1000); // 设置1秒的延迟
  } else {
    searchResults.value = [];
  }
};

const activeModelAvatar = computed(() => {
  return String(
    usingPlugin?.value?.pluginImg ||
      configObj?.value.modelInfo?.modelAvatar ||
      ''
  );
});

// 初始化randomStyles或者在需要时更新它
const updateRandomStyles = () => {
  const stylesArray = globaelConfig.value?.drawingStyles.split(',');
  const shuffled = stylesArray.sort(() => 0.5 - Math.random());
  // 如果是移动端，只显示3个；否则显示5个
  const displayCount = isMobile.value ? 3 : 5;
  randomStyles.value = shuffled.slice(0, displayCount);
};

async function appendStyleToInput(style: any) {
  // 检查prompt.value是否非空并且以逗号结尾
  if (prompt.value && /,\s*$/.test(prompt.value)) {
    // 如果已经以逗号结尾，直接添加风格
    await chatStore.setPrompt(`${prompt.value} ${style}`);
    // prompt.value += ` ${style}`;
  } else if (prompt.value) {
    // 如果非空但不以逗号结尾，先添加逗号再添加风格
    await chatStore.setPrompt(`${prompt.value}, ${style}`);
    // prompt.value += `, ${style}`;
  } else {
    // 如果prompt.value为空，只添加风格不添加逗号
    await chatStore.setPrompt(`${style}`);
    // prompt.value = `${style} ,`;
  }

  // 确保inputRef是已经和textarea元素绑定的ref
  inputRef.value.focus();
  inputRef.value.scrollTop = inputRef.value.scrollHeight;
}

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>;

const handleSubmit = async (index?: number) => {
  if (isStreamIn.value) {
    return;
  }
  if (chatStore.groupList.length === 0) {
    await createNewChatGroup();
  }
  chatStore.setStreamIn(true);
  let action = '';
  if (usingPlugin.value?.parameters === 'suno-music') {
    action = 'LYRICS';
  } else if (usingPlugin.value?.parameters === 'midjourney') {
    if (mjUrlParam.value === 'imageToText') {
      action = 'DESCRIBE';
    } else {
      action = 'IMAGINE';
    }
  }

  let useModel = selectedApp?.value?.model || chatStore?.activeModel;
  let useModelName =
    usingPlugin?.value?.pluginName ||
    selectedApp?.value?.name ||
    activeModelName.value;

  const useModelType = activeModelKeyType.value;

  if (usingPlugin.value?.deductType && usingPlugin.value?.deductType !== 0) {
    useModel = usingPlugin.value?.parameters;
  }

  let modelAvatar = selectedApp?.value?.coverImg || activeModelAvatar.value;
  let appId;

  if (selectedApp?.value) {
    appId = selectedApp?.value?.id;
  } else {
    appId = activeGroupInfo?.value?.appId;
  }

  let fileUrl = '';
  console.log(prompt);
  let msg = prompt.value || '';

  if (isPptModel.value && fileUrl.length === 0) {
    msg = `使用 ${fileName} 生成 PPT`;
  }
  if (
    (activeModelFileUpload.value === 1 ||
      activeModelFileUpload.value === 2 ||
      (activeModelFileUpload.value === 3 &&
        fileList.value[0]?.type.startsWith('image/')) ||
      isMidjourneyModel.value ||
      isLumaVideoModel.value ||
      isPptModel.value ||
      isCogViewModel.value) &&
    dataBase64List.value.length > 0
  ) {
    console.log('满足文件上传条件，开始上传文件');
    fileUrl = await uploadFiles();
    console.log('文件上传成功，文件 URL:', fileUrl);

    isUploading.value = false;
    dataBase64List.value = [];
    fileList.value = [];
  }

  if (useModel === 'midjourney' && action === 'IMAGINE') {
    if (fileUrl) {
      switch (mjUrlParam.value) {
        case 'faceConsistency':
          msg = `${msg} --cref ${fileUrl} --cw 100`;
          break;
        case 'styleConsistency':
          msg = `${msg} --sref ${fileUrl}`;
          break;
        default:
          msg = `${fileUrl} ${msg}`;
      }
    }

    if (extraParam.value.size && !msg.includes('--ar')) {
      let size = extraParam.value.size;

      // 检测并转换格式
      switch (size) {
        case '1024x1024':
          size = '1:1';
          break;
        case '1792x1024':
          size = '16:9';
          break;
        case '1024x1792':
          size = '9:16';
          break;
        default:
          // 保留原始大小
          break;
      }

      msg = `${msg} --ar ${size}`;
    }

    if (
      mjVersionsParam.value &&
      !msg.includes('--v') &&
      !msg.includes('--niji')
    ) {
      msg = `${msg} ${mjVersionsParam.value}`;
    }
  }

  if (action === 'DESCRIBE') {
    if (fileUrl) {
      msg = `以图生文`;
    }
  }

  if (appId) {
    try {
      const res: any = await fetchQueryOneCatAPI({ id: appId });
      modelAvatar = res.data.modelAvatar;
    } catch (error) {}
  }

  await chatStore.setPrompt('');
  // prompt.value = '';
  dataBase64List.value = [];
  fileList.value = [];
  inputRef.value.style.height = '1.5rem'; // 使用初始高度

  console.log('开始对话', {
    prompt,
    action,
    useModel,
    useModelName,
    useModelType,
    modelAvatar,
    appId,
    extraParam: extraParam.value,
    fileUrl,
    pluginParam: usingPlugin.value?.parameters,
  });

  await onConversation({
    msg: msg,
    action: action,
    model: useModel,
    modelName: useModelName,
    modelType: useModelType,
    modelAvatar: modelAvatar,
    appId: appId,
    extraParam: extraParam.value,
    fileUrl: fileUrl,
    pluginParam: usingPlugin.value?.parameters,
  });

  chatStore.setStreamIn(false);
  isUploading.value = false;
};

const uploadFiles = async (): Promise<string> => {
  isUploading.value = true; // 标记上传开始
  const results: any[] = []; // 用于存储每个文件的上传结果

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
    const day = String(now.getDate()).padStart(2, '0');
    const currentDate = `${year}${month}/${day}`;
    const dir = `userFiles/${currentDate}`;

    // 使用 Promise.all 并行上传所有文件
    const uploadPromises = Array.from(fileList.value).map(async (file) => {
      const form = new FormData();
      form.append('file', file);

      try {
        const res = await axios.post(
          `${uploadUrl.value}?dir=${encodeURIComponent(dir)}`,
          form,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
          }
        );
        return res?.data?.data; // 返回上传结果
      } catch (error) {
        console.error(`上传文件 ${file.name} 失败:`, error);
        return `上传文件 ${file.name} 失败`; // 返回失败信息
      }
    });

    // 等待所有文件上传完成，并将结果保存到 results 数组中
    results.push(...(await Promise.all(uploadPromises)));
  } catch (error) {
    console.error('上传文件过程中发生错误:', error);
  } finally {
    isUploading.value = false; // 标记上传结束
  }

  // 使用逗号将结果数组连接成字符串并返回
  return results.join(', '); // 返回所有文件的上传结果字符串
};

// const handleFileSelect = async (event: Event) => {
//   console.log('文件选择事件触发');
//   const input = event.target as HTMLInputElement;
//   const file = input?.files?.[0];
//   if (file) {
//     await processFile(file);
//     input.value = '';
//   }
// };

// const handlePaste = async (event: ClipboardEvent) => {
//   const clipboardData = event.clipboardData || (window as any).clipboardData;
//   const items = clipboardData.items;
//   for (const item of items) {
//     if (item.kind === 'file') {
//       const file = item.getAsFile();
//       if (file) {
//         await processFile(file);
//       }
//     }
//   }
// };

const handlePaste = async (event: ClipboardEvent) => {
  const clipboardData = event.clipboardData || (window as any).clipboardData;
  const items = clipboardData.items;

  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        await processFile(file);
      }
    }
  }
};

const processFile = async (file: File) => {
  let trimmedFileName = file.name;
  const maxLength = 25; // 最大长度限制
  const extension = trimmedFileName.split('.').pop() || ''; // 获取文件扩展名

  if (trimmedFileName.length > maxLength) {
    // 截取文件名并添加省略号，同时保留扩展名
    trimmedFileName =
      trimmedFileName.substring(0, maxLength - extension.length - 1) +
      '….' +
      extension;
  }

  // 检查文件类型
  if (file.type.startsWith('image/')) {
    // 处理图像文件
    isFile.value = false;
    await cleanUpFiles();
    handleSetFile(file);
    // await updateGroup({ fileName: trimmedFileName });
  } else {
    isFile.value = true;
    dataBase64List.value = [];
    fileList.value = [];
    handleSetFile(file);
    if (
      activeModelFileUpload.value === 3 &&
      !isPptModel.value &&
      !isCogViewModel.value &&
      !isLumaVideoModel.value &&
      !isMidjourneyModel.value
    ) {
      const fileParsing = await parseFile();
      if (fileParsing) {
        await updateGroup({
          fileName: trimmedFileName,
          fileParsing: fileParsing,
        });
      }
    } else {
      await updateGroup({ fileName: trimmedFileName });
    }
  }

  if (isPptModel.value) {
    await chatStore.setPrompt(`使用 ${trimmedFileName} 生成 PPT`);
    // prompt.value = `使用 ${trimmedFileName} 生成 PPT`;
  }
};

// 异步函数用于检查并清理 dataBase64List 和 fileList 中的非图像文件
async function cleanUpFiles() {
  await updateGroup({ fileParsing: '', fileName: '' });
  // 创建一个新数组，仅保留 fileList 中的图像文件
  const imageFiles = fileList.value.filter((file: File) =>
    file.type.startsWith('image/')
  );

  // 创建一个新数组，仅保留 dataBase64List 中对应的图像文件的 Base64 数据
  const imageBase64List = dataBase64List.value.filter(
    (base64: string, index: number) => {
      return (
        fileList.value[index] && fileList.value[index].type.startsWith('image/')
      );
    }
  );

  // 更新 fileList 和 dataBase64List 为仅包含图像文件
  fileList.value = imageFiles;
  dataBase64List.value = imageBase64List;

  // 如果文件数量超过4个，移除最前面的一个文件和其对应的Base64数据
  if (fileList.value.length >= 4) {
    fileList.value.shift(); // 删除第一个文件
    dataBase64List.value.shift(); // 删除第一个文件的 Base64 数据
  }
}

const triggerFileUpload = () => {
  fileInput?.value?.click();
};

const fileList = ref<File[]>([]); // 使用 ref 来创建响应式的文件列表
const dataBase64List = ref<string[]>([]); // 使用 ref 来创建响应式的 Base64 数据列表

const handleSetFile = async (file: File) => {
  fileList.value.push(file); // 使用 .value 访问 ref 对象并追加新文件

  const reader = new FileReader();

  reader.onload = (event: any) => {
    const base64Data = event.target?.result as string;
    dataBase64List.value.push(base64Data); // 使用 .value 访问 ref 对象并追加 Base64 数据
    console.log(`文件 ${file.name} 的 Base64 数据已添加`);
  };

  reader.readAsDataURL(file); // 读取文件并转换为 Base64

  fileInput.value = null;
};

const clearData = async (index: number) => {
  dataBase64List.value.splice(index, 1); // 使用 .value 访问 ref 对象并删除指定索引的图片数据
  fileList.value.splice(index, 1); // 同时删除对应的文件
  await updateGroup({ fileParsing: '', fileName: '' });
};

const handleFileSelect = async (event: Event) => {
  console.log('文件选择事件触发');
  const input = event.target as HTMLInputElement;
  const file = input?.files?.[0];
  if (file) {
    await processFile(file);
    input.value = '';
  }
};

const clearSelectApp = async () => {
  searchResults.value = [];
  showSuggestions.value = false;
  isSelectedApp.value = false;
  selectedApp.value = null;
  chatStore.setUsingPlugin(null);
};

// 解析文件内容
const parseFile = async () => {
  isUploading.value = true;
  try {
    if (!fileList.value.length) {
      throw new Error('No file selected');
    }

    const file = fileList.value[0];
    const fileType: string = file.type;
    let text = '';
    // console.log('fileType', fileType);

    if (fileType.startsWith('text/')) {
      text = await readText(file);
    } else {
      switch (fileType) {
        case 'application/pdf':
          text = await readPDF(file);
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          text = await readOfficeFile(file, 'word/document.xml', 'word');
          break;
        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
          text = await readOfficeFile(file, 'ppt/slides/slide1.xml', 'ppt');
          break;
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          text = await readOfficeFile(
            file,
            'xl/worksheets/sheet1.xml',
            'excel'
          );
          break;
        case 'application/xml':
        case 'application/javascript':
        case 'application/xslt+xml':
        case 'application/json':
        case 'application/sql':
          text = await readText(file);
          break;
        default:
          console.warn('Unsupported file type:', fileType);
          alert('Unsupported file type');
      }
    }

    // 检查文本长度并截断
    if (text.length > 50000) {
      console.warn('Text exceeds 50000 characters, truncating...');
      text = text.slice(0, 50000);
    }

    return text;
  } catch (error) {
    console.error(error);
    return null;
  } finally {
    isUploading.value = false;
    dataBase64List.value = [];
    fileList.value = [];
  }
};

const readPDF = async (file: File) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const loadingTask = createLoadingTask(uint8Array);
    const pdf = await loadingTask.promise;
    let text = '';

    // console.log(`PDF loaded: ${pdf.numPages} pages.`);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // console.log(`Reading page ${i}/${pdf.numPages}`);

      const pageText = textContent.items
        .map((item: any) => {
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .join(' ');

      // console.log(`Page ${i} text content: ${pageText}`);

      text += `{${pageText}}\n`;
    }

    // console.log(`Final extracted text: ${text}`);
    return text;
  } catch (error) {
    console.error('Error reading PDF file:', error);
    return '';
  }
};

const readOfficeFile = async (
  file: File,
  filePath: string,
  fileType: string
): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const fileInZip = zip.file(filePath);

    if (!fileInZip) {
      throw new Error(`File path ${filePath} not found in the ZIP archive`);
    }

    const xml = await fileInZip.async('text');
    const json = await parseStringPromise(xml);
    return extractText(json, fileType);
  } catch (error) {
    console.error(`Error reading ${filePath} file:`, error);
    return '';
  }
};

const extractText = (json: any, fileType: string): string => {
  let text = '';
  if (fileType === 'word') {
    const paragraphs = json['w:document']['w:body'][0]['w:p'];
    text = extractTextFromParagraphs(paragraphs);
  } else if (fileType === 'ppt') {
    const paragraphs = json['p:sld']['p:cSld'][0]['p:spTree'][0]['p:sp'];
    if (paragraphs) {
      paragraphs.forEach((paragraph: any) => {
        if (paragraph['p:txBody']) {
          const texts = paragraph['p:txBody'][0]['a:p'].map((p: any) => {
            return p['a:r']
              ? p['a:r']
                  .map((r: any) => r['a:t'])
                  .filter(Boolean)
                  .join(' ')
              : '';
          });
          text += texts.join(' ') + '\n';
        }
      });
    }
  } else if (fileType === 'excel') {
    const rows = json['worksheet']['sheetData'][0]['row'];
    if (rows) {
      rows.forEach((row: any) => {
        const cells = row['c']
          ? row['c'].map((cell: any) => cell['v']).join(' ')
          : '';
        text += cells + '\n';
      });
    }
  }
  return text;
};

const extractTextFromParagraphs = (paragraphs: any): string => {
  let text = '';
  if (paragraphs) {
    paragraphs.forEach((paragraph: any) => {
      const texts = paragraph['w:r']
        ? paragraph['w:r']
            .map((run: any) => run['w:t'])
            .filter(Boolean)
            .join(' ')
        : '';
      text += texts + '\n';
    });
  }
  return text;
};

// 读取TXT文件
const readText = async (file: File) => {
  const text = await file.text();
  return text;
};

/* 修改对话组模型配置 */
const updateGroup = async (option: any) => {
  const { modelInfo, fileInfo } = chatStore.activeConfig;
  const config = {
    modelInfo: {
      ...modelInfo,
    },
    fileInfo: {
      // 确保即使 fileInfo 或 fileInfo.fileParsing 不存在，也不会导致错误
      fileParsing:
        option.fileParsing !== undefined
          ? option.fileParsing
          : fileInfo?.fileParsing,
      // 确保即使 fileInfo 或 fileInfo.fileName 不存在，也不会导致错误
      fileName:
        option.fileName !== undefined ? option.fileName : fileInfo?.fileName,
    },
  };

  const params = {
    groupId: activeGroupId.value,
    config: JSON.stringify(config),
  };
  await fetchUpdateGroupAPI(params);
  await chatStore.queryMyGroup();
  // useGlobalStore.updateModelDialog(false);
};

const handleEnter = (event: KeyboardEvent) => {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  } else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      handleSubmit();
    }
  }
};

const selectApp = async (app: any) => {
  // 这里可以设置选中的应用程序的逻辑
  selectedApp.value = app;
  isSelectedApp.value = true;
  await chatStore.setPrompt('');
  // prompt.value = '';
  inputRef.value?.focus();
};

const handleStop = () => {
  emit('pause-request');
  chatStore.setStreamIn(false);
};

watch(
  [customWidth, customHeight],
  ([newWidth, newHeight], [oldWidth, oldHeight]) => {
    // 当两个输入都被填写且与之前的值不同时，执行switchSize
    if (
      newWidth &&
      newHeight &&
      (newWidth !== oldWidth || newHeight !== oldHeight)
    ) {
      switchSize({
        id: 'custom',
        title: `${newWidth}:${newHeight}`,
        values: `${newWidth}:${newHeight}`,
        aspectRatio: `${newWidth} / ${newHeight}`,
      });
      customAspectRatio.value = `${customWidth.value} / ${customHeight.value}`;
    }
  }
);

watch(clipboardText, async (val) => {
  await chatStore.setPrompt(val);
  // prompt.value = val;
  inputRef.value?.focus();
  inputRef.value.scrollTop = inputRef.value.scrollHeight;
});

watch(
  dataSources,
  (val) => {
    if (val.length === 0) return;
  },
  { immediate: true }
);

onMounted(() => {
  // 初始化 randomStyles
  updateRandomStyles();
  chatStore.setPrompt('');

  // 设置焦点
  nextTick(() => {
    if (inputRef.value && !isMobile.value) {
      inputRef.value.focus();
    }
  });
});
</script>

<template>
  <footer
    class="flex flex-col items-center justify-center w-full"
    :class="[isMobile ? 'px-2 mb-3' : 'px-10']"
  >
    <div
      v-if="!isPdfRoute"
      class="flex pb-2 justify-center w-full flex-col m-auto rounded-lg px-0 border-0 bg-transparent sm:text-sm sm:leading-6 resize-none"
      :class="[isMobile ? '   mx-2' : '   pt-1 mx-10 ']"
      :style="{ maxWidth: '64rem' }"
    >
      <div class="flex justify-between items-end w-full bg-transparent">
        <div
          v-if="(isDalleModel || isMidjourneyModel || isFluxModel) && !isMobile"
          class="flex flex-nowrap overflow-x-auto scrollbar-hide ml-2"
        >
          <button
            v-for="(style, index) in randomStyles"
            :key="index"
            @click="appendStyleToInput(style)"
            class="mx-1 shadow-sm rounded-md ring-1 ring-gray-300 dark:ring-gray-600 px-2 py-1 my-1 hover:bg-opacity dark:hover:bg-gray-750 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 whitespace-nowrap"
          >
            {{ style }}
          </button>

          <button
            @click="updateRandomStyles"
            class="mx-1 shadow-sm rounded-md ring-1 ring-gray-300 dark:ring-gray-600 px-2 py-1 my-1 hover:bg-opacity dark:hover:bg-gray-750 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 whitespace-nowrap"
          >
            <ShuffleOne theme="outline" size="16" class="my-4" />
          </button>
        </div>
        <div class="flex-1 bg-transparent"></div>
        <div
          class="menu-container bg-transparent"
          style="display: flex; justify-content: flex-end"
        >
          <Menu
            v-if="isMidjourneyModel"
            as="div"
            class="relative hover:bg-opacity dark:hover:bg-gray-750 inline-block text-left group shadow-sm rounded-md ring-1 ring-gray-300 dark:ring-gray-600 dark:bg-gray-800 mr-3 my-1 py-1 px-2"
          >
            <MenuButton
              class="inline-flex w-full justify-center rounded-md text-sm text-gray-500 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300 whitespace-nowrap"
            >
              {{ selectedMjUrl.title }}
            </MenuButton>

            <transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="transform opacity-0 scale-95"
              enter-to-class="transform opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="transform opacity-100 scale-100"
              leave-to-class="transform opacity-0 scale-95"
            >
              <MenuItems
                class="absolute right-0 bottom-full mb-2 w-28 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-750 dark:text-gray-400"
              >
                <div class="py-1">
                  <MenuItem v-for="(option, index) in mjUrl" :key="index">
                    <div
                      class="group flex items-center"
                      @click="switchMjUrl(option)"
                    >
                      <a
                        href="#"
                        class="flex w-full items-center px-3 py-1 text-sm hover:bg-opacity dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        {{ option.title }}
                      </a>
                    </div>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition>
          </Menu>
          <Menu
            v-if="isMidjourneyModel"
            as="div"
            class="relative hover:bg-opacity dark:hover:bg-gray-750 inline-block text-left group shadow-sm rounded-md ring-1 ring-gray-300 dark:ring-gray-600 dark:bg-gray-800 mr-3 my-1 py-1 px-2"
          >
            <MenuButton
              class="inline-flex w-full justify-center rounded-md text-sm text-gray-500 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300 whitespace-nowrap"
            >
              版本：{{ selectedMjVersion.title }}
            </MenuButton>

            <transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="transform opacity-0 scale-95"
              enter-to-class="transform opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="transform opacity-100 scale-100"
              leave-to-class="transform opacity-0 scale-95"
            >
              <MenuItems
                class="absolute right-0 bottom-full mb-2 w-28 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-750 dark:text-gray-400 text-gray-900"
              >
                <div class="py-1">
                  <MenuItem v-for="(option, index) in mjVersions" :key="index">
                    <div
                      class="group flex items-center"
                      @click="switchMjVersion(option)"
                    >
                      <a
                        href="#"
                        class="flex w-full items-center px-3 py-1 text-sm hover:bg-opacity dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        {{ option.title }}
                      </a>
                    </div>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition>
          </Menu>
        </div>
        <div
          class="menu-container bg-transparent"
          style="display: flex; justify-content: flex-end"
        >
          <Menu
            v-if="isDalleModel || isFluxModel"
            as="div"
            class="relative hover:bg-opacity dark:hover:bg-gray-750 inline-block text-left group shadow-sm rounded-md ring-1 ring-gray-300 dark:ring-gray-600 dark:bg-gray-800 mr-3 my-1 py-1 px-2"
          >
            <MenuButton
              class="inline-flex w-full justify-center rounded-md text-sm text-gray-500 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300 whitespace-nowrap"
            >
              {{ t('chat.size') + selectedSize.title }}
            </MenuButton>

            <transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="transform opacity-0 scale-95"
              enter-to-class="transform opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="transform opacity-100 scale-100"
              leave-to-class="transform opacity-0 scale-95"
            >
              <MenuItems
                class="absolute right-0 bottom-full mb-2 w-40 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-750 dark:text-gray-400 text-gray-900"
              >
                <div class="py-1">
                  <MenuItem v-for="(option, index) in sizes" :key="index">
                    <div
                      class="group flex items-center"
                      @click="switchSize(option)"
                    >
                      <a
                        href="#"
                        class="flex w-full items-center pl-0 pr-3 py-1 text-sm hover:bg-opacity dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        <div class="flex flex-1 justify-center">
                          <div
                            :style="getAspectRatioStyle(option.aspectRatio)"
                            class="flex border border-gray-500 dark:border-gray-300 rounded-sm"
                          ></div>
                        </div>
                        <div class="w-28">
                          {{ option.title }}
                        </div>
                      </a>
                    </div>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition>
          </Menu>
          <Menu
            v-if="isLumaVideoModel || isCogViewModel"
            as="div"
            class="relative hover:bg-opacity dark:hover:bg-gray-750 inline-block text-left group shadow-sm rounded-md ring-1 ring-gray-300 dark:ring-gray-600 dark:bg-gray-800 mr-3 my-1 py-1 px-2"
          >
            <MenuButton
              class="inline-flex w-full justify-center rounded-md text-sm text-gray-500 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300 whitespace-nowrap"
              @click="triggerFileUpload"
            >
              图生视频
            </MenuButton>
          </Menu>
          <Menu
            v-if="isMidjourneyModel || isLumaVideoModel"
            as="div"
            class="relative hover:bg-opacity dark:hover:bg-gray-750 inline-block text-left group shadow-sm rounded-md ring-1 ring-gray-300 dark:ring-gray-600 dark:bg-gray-800 mr-3 my-1 py-1 px-2"
          >
            <MenuButton
              class="inline-flex w-full justify-center rounded-md text-sm text-gray-500 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300 whitespace-nowrap"
            >
              {{ t('chat.size') + selectedSize.title }}
            </MenuButton>

            <transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="transform opacity-0 scale-95"
              enter-to-class="transform opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="transform opacity-100 scale-100"
              leave-to-class="transform opacity-0 scale-95"
            >
              <MenuItems
                class="absolute right-0 bottom-full mb-2 w-40 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-750 dark:text-gray-400 text-gray-900"
              >
                <div class="py-1">
                  <MenuItem v-for="(option, index) in mjSizes" :key="index">
                    <div
                      class="group flex items-center"
                      @click="switchSize(option)"
                    >
                      <a
                        href="#"
                        class="flex w-full items-center pl-0 pr-3 py-1 text-sm hover:bg-opacity dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        <div class="flex flex-1 justify-center">
                          <div
                            :style="getAspectRatioStyle(option.aspectRatio)"
                            class="flex border border-gray-500 dark:border-gray-300 rounded-sm"
                          ></div>
                        </div>
                        <div class="w-28">
                          {{ option.title }}
                        </div>
                      </a>
                    </div>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition>
          </Menu>
        </div>
      </div>
    </div>

    <div
      v-if="showSuggestions && !isSelectedApp && !usingPlugin && !isPdfRoute"
      class="flex mb-2 w-full px-2 py-1 justify-center items-center flex-col m-auto rounded-lg shadow-sm ring-1 ring-gray-300 resize-none dark:ring-gray-750 dark:bg-gray-800"
      :class="[isMobile ? 'mx-2' : 'mx-10']"
      :style="{ maxWidth: '64rem', minHeight: '1.5rem' }"
    >
      <div
        v-if="searchResults.length === 0"
        class="flex items-center py-2 px-2 rounded-lg w-full cursor-pointer transition duration-150 ease-in-out"
      >
        <p class="text-sm text-gray-500 dark:text-gray-400 flex-grow truncate">
          使用 @ 搜索应用程序
        </p>
      </div>
      <div
        v-for="app in searchResults"
        :key="app.id"
        @click="selectApp(app)"
        class="flex items-center bg-white dark:bg-gray-800 hover:bg-gray-100 py-2 px-2 dark:hover:bg-gray-700 rounded-lg w-full cursor-pointer transition duration-150 ease-in-out"
      >
        <div
          class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
        >
          <img
            v-if="app.coverImg"
            :src="app.coverImg"
            alt="Cover Image"
            class="w-8 h-8 rounded-full flex justify-start"
          />
          <span
            v-else
            class="w-8 h-8 text-sm font-medium text-gray-700 dark:text-gray-400 rounded-full flex items-center justify-center dark:bg-gray-700"
          >
            {{ app.name.charAt(0) }}
          </span>
        </div>

        <h3
          class="text-md font-bold text-gray-600 dark:text-primary-500 mr-3 flex-shrink-0"
        >
          {{ app.name }}
        </h3>
        <p class="text-sm text-gray-400 dark:text-gray-400 flex-grow truncate">
          {{ app.des }}
        </p>
      </div>
    </div>

    <div
      class="flex mb-2 mt-1 w-full justify-center items-center flex-col m-auto rounded-lg shadow-sm ring-1 ring-gray-300 focus-within:ring-2 focus-within:ring-primary-500 text-gray-900 placeholder:text-gray-400 border-0 bg-transparent sm:text-sm sm:leading-6 resize-none dark:focus:ring-gray-750 dark:ring-gray-750 dark:bg-gray-750"
      :class="[isMobile ? '  mx-2' : '   mx-10 ']"
      :style="{ maxWidth: '64rem', minHeight: '1.5rem' }"
    >
      <div
        v-if="
          dataBase64List.length > 0 ||
          fileParsing ||
          isSelectedApp ||
          usingPlugin
        "
        class="self-start w-full bg-opacity dark:bg-gray-700 rounded-lg"
      >
        <template v-if="dataBase64List.length > 0 && !isFile">
          <div
            class="relative inline-block ml-2 mt-2 group"
            v-for="(base64, index) in dataBase64List"
            :key="index"
          >
            <!-- 父容器，对图片和图标进行相对定位 -->
            <img
              :src="base64"
              class="max-h-16 border border-gray-300 rounded-lg"
              alt="预览图片"
            />
            <div
              class="absolute top-2 right-0 transform -translate-y-1/2 cursor-pointer text-gray-300 group-hover:text-gray-500"
              @click="clearData(index)"
            >
              <Close class="rounded-full" />
            </div>
          </div>
        </template>
        <template
          v-if="
            isFile && (dataBase64List.length > 0 || fileParsing) && !isPdfRoute
          "
        >
          <div class="relative group w-full">
            <div
              class="px-3 flex items-center justify-start bg-opacity rounded-t-lg h-12 text-gray-700 dark:text-gray-400"
            >
              <span class="text-gray-500">{{ fileName }}</span>
            </div>
            <div
              class="absolute top-1/2 right-2 transform -translate-y-1/2 cursor-pointer text-gray-300 group-hover:text-gray-500"
              @click="clearData(0)"
            >
              <Close size="18" class="rounded-full" />
            </div>
          </div>
        </template>
        <div
          v-if="!isPdfRoute"
          class="relative group w-full"
          @mouseover="showDeleteIcon = true"
          @mouseleave="showDeleteIcon = false"
        >
          <template v-if="usingPlugin" class="w-full">
            <div
              class="px-2 flex items-center justify-start rounded-t-lg h-12 text-gray-700 bg-opacity dark:bg-gray-700 dark:text-gray-400 w-full"
            >
              <div
                class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
              >
                <img
                  v-if="usingPlugin.pluginImg"
                  :src="usingPlugin.pluginImg"
                  alt="Cover Image"
                  class="w-8 h-8 rounded-full flex justify-start"
                />
                <span
                  v-else
                  class="w-8 h-8 text-sm font-medium text-gray-700 dark:text-gray-400 rounded-full flex items-center justify-center dark:bg-gray-700"
                >
                  {{ usingPlugin.pluginName.charAt(0) }}
                </span>
              </div>

              <h3
                class="text-md font-bold text-gray-700 dark:text-gray-400 mr-3 flex-shrink-0 flex justify-start"
              >
                {{ usingPlugin.pluginName }}
              </h3>
              <p
                class="text-sm text-gray-400 dark:text-gray-400 truncate pr-10"
              >
                {{ usingPlugin.description }}
              </p>
            </div>

            <div
              class="absolute top-1/2 right-2 transform -translate-y-1/2 cursor-pointer text-gray-300 group-hover:text-gray-500"
              @click="clearSelectApp()"
            >
              <Close size="18" class="rounded-full" />
            </div>
          </template>
          <template v-if="isSelectedApp && !usingPlugin" class="w-full">
            <!-- 非图片文件预览（例如文件图标），同样设置 margin-top -->
            <div
              class="px-2 flex items-center justify-start bg-opacity rounded-t-lg h-12 text-gray-700 dark:text-gray-400 w-full dark:bg-gray-700"
            >
              <div
                class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
              >
                <img
                  v-if="selectedApp.coverImg"
                  :src="selectedApp.coverImg"
                  alt="Cover Image"
                  class="w-8 h-8 rounded-full flex justify-start"
                />
                <span
                  v-else
                  class="w-8 h-8 text-sm font-medium text-gray-700 dark:text-gray-400 rounded-full flex items-center justify-center dark:bg-gray-700"
                >
                  {{ selectedApp.name.charAt(0) }}
                </span>
              </div>
              <h3
                class="text-md font-bold text-gray-600 dark:text-gray-400 mr-3 flex-shrink-0 flex justify-start"
              >
                {{ selectedApp.name }}
              </h3>
              <p
                class="text-sm text-gray-400 dark:text-gray-400 truncate pr-10"
              >
                {{ selectedApp.des }}
              </p>
            </div>
            <div
              class="absolute top-1/2 right-2 transform -translate-y-1/2 cursor-pointer text-gray-300 group-hover:text-gray-500"
              @click="clearSelectApp()"
            >
              <Close size="18" class="rounded-full" />
            </div>
          </template>
        </div>
      </div>
      <!-- 按钮容器 -->
      <div class="flex justify-between flex-grow w-full py-2 px-2">
        <!-- 文件上传按钮 -->
        <div class="flex justify-start items-end">
          <Link
            v-if="
              ((isFilesModel && !usingPlugin) ||
                isMidjourneyModel ||
                isLumaVideoModel ||
                isPptModel ||
                isCogViewModel) &&
              !isUploading &&
              !isPdfRoute
            "
            size="24"
            class="p-1 text-gray-400 dark:text-gray-600 dark:hover:text-gray-500"
            @click="triggerFileUpload"
          />

          <LoadingFour
            v-if="isUploading"
            size="24"
            class="p-1 rotate-icon text-gray-400 dark:text-gray-600 hover:text-gray-500"
          />

          <!-- 文件上传隐藏输入 -->
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            @change="handleFileSelect"
            accept="image/*, .pdf, .txt, .docx, .pptx, .xlsx, .xml, .js, .xslt, .json, .sql"
          />
        </div>
        <div class="flex flex-grow items-center justify-center">
          <textarea
            ref="inputRef"
            v-model="prompt"
            :placeholder="placeholder"
            class="w-full border-0 text-gray-800 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-transparent text-md leading-6 resize-none dark:text-gray-400 px-2 my-1"
            @input="autoResize"
            @keypress="handleEnter"
            @keyup="handleInput"
            @paste="handlePaste"
            :style="{ maxHeight: '30vh', minHeight: '1.5rem' }"
          ></textarea>
        </div>

        <div class="flex justify-end items-end">
          <!-- 当不在加载状态时显示这个按钮，用于提交 -->
          <button
            v-if="!isStreamIn"
            type="button"
            class="rounded-md text-sm font-semibold text-white dark:hover:text-gray-200 p-2 shadow-sm dark:text-gray-400"
            :class="{
              'bg-primary-600 dark:bg-primary-700': !buttonDisabled,
              'bg-primary-300 dark:bg-gray-700': buttonDisabled,
            }"
            :disabled="buttonDisabled"
            @click="handleSubmit()"
          >
            <SendOne size="16" />
          </button>

          <!-- 当在加载状态时显示这个按钮，用于停止 -->
          <button
            v-if="isStreamIn"
            type="button"
            class="rounded-md bg-primary-600 text-sm font-semibold text-white dark:hover:text-gray-200 p-2 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:bg-primary-900 dark:text-gray-400"
            @click="handleStop()"
          >
            <Square size="16" />
          </button>
        </div>
      </div>
    </div>
  </footer>

  <div
    v-if="isSetBeian && !isMobile"
    class="w-full flex justify-center items-center text-sm text-gray-500"
  >
    {{ t('chat.generatedContentDisclaimer') }}
    {{ globaelConfig?.companyName }}
    <a
      class="transition-all text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 ml-2"
      href="https://beian.miit.gov.cn"
      target="_blank"
      >{{ globaelConfig?.filingNumber }}</a
    >
  </div>
</template>

<style>
@keyframes rotateAnimation {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
::v-deep .rotate-icon {
  animation: rotateAnimation 1s linear infinite;
}
</style>
