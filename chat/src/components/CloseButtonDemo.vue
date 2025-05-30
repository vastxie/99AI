<template>
  <div class="p-6 space-y-4 dark:bg-gray-800">
    <h1 class="text-xl font-bold dark:text-white">关闭按钮演示</h1>

    <div class="flex items-center space-x-6">
      <div class="space-y-2">
        <p class="text-sm dark:text-gray-300">小尺寸</p>
        <button class="btn-close btn-close-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            class="w-4 h-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-2">
        <p class="text-sm dark:text-gray-300">中尺寸</p>
        <button class="btn-close btn-close-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            class="w-5 h-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-2">
        <p class="text-sm dark:text-gray-300">大尺寸</p>
        <button class="btn-close btn-close-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            class="w-6 h-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="p-4 border rounded-lg dark:border-gray-700 relative">
      <h2 class="text-lg font-semibold dark:text-white">模态框示例</h2>
      <p class="mt-2 dark:text-gray-300">这是一个带有关闭按钮的模态框示例</p>
      <button class="btn-close btn-close-md absolute top-3 right-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          class="w-5 h-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
// 无需特别的逻辑
</script>
