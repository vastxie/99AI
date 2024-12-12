<script>
export default {
  mounted() {
    // 加密后的 GitHub 地址部分
    const encryptedUrl = 'Z2l0aHViLmNvbS92YXN0eGllLzk5QUk=';
    const decryptedUrl = this.decrypt(encryptedUrl);
    if (decryptedUrl) {
      // 确保跳转到完整的 HTTPS 地址
      const fullUrl = `https://${decryptedUrl}`;
      // 在新标签页中打开 GitHub 页面
      window.open(fullUrl, '_blank');
      // 返回上一级
      this.$router.go(-1);
    } else {
      console.error('解密失败或无效的地址');
    }
  },
  methods: {
    decrypt(text) {
      try {
        return atob(text); // 使用 Base64 解码
      } catch (error) {
        console.error('解密失败', error);
        return '';
      }
    },
  },
};
</script>

<template>
  <div>
    <!-- 不需要显示任何内容 -->
  </div>
</template>
