<script lang="ts" setup name="PersonalSetting">
  import useUserStore from '@/store/modules/user';
  import { ElMessage, ElMessageBox } from 'element-plus';

  const router = useRouter();
  const userStore = useUserStore();

  const currentUsername = computed(() => userStore.username);

  function editPassword() {
    router.push({ name: 'personalEditPassword' });
  }

  async function editUsername() {
    try {
      const { value: newUsername } = await ElMessageBox.prompt('请输入新的用户名', '编辑用户名', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: currentUsername.value,
        inputValidator: (value) => {
          if (!value) return '用户名不能为空';
          if (value.length < 2) return '用户名最少 2 个字符';
          if (value.length > 20) return '用户名最多 20 个字符';
          return true;
        },
      });
      await userStore.updateProfile({ username: newUsername });
      ElMessage.success('用户名已更新');
    } catch {
      // 取消，或请求失败（请求层已提示）
    }
  }
</script>

<template>
  <div>
    <page-panel title="账号安全">
      <div class="setting-list">
        <div class="setting-item">
          <div class="min-w-0">
            <div class="setting-title">用户名</div>
            <div class="setting-desc">当前用户名：{{ currentUsername }}</div>
          </div>
          <el-button link type="primary" @click="editUsername">编辑</el-button>
        </div>
        <div class="setting-item">
          <div class="min-w-0">
            <div class="setting-title">登录密码</div>
            <div class="setting-desc">定期修改密码可以提高账号安全性</div>
          </div>
          <el-button link type="primary" @click="editPassword">修改</el-button>
        </div>
      </div>
    </page-panel>
  </div>
</template>

<style scoped>
  .setting-list {
    max-width: 720px;
  }

  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 0;
    border-bottom: 1px solid var(--u-border-light);
  }

  .setting-item:last-child {
    border-bottom: 0;
  }

  .setting-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--u-text-primary);
  }

  .setting-desc {
    margin-top: 2px;
    font-size: 13px;
    color: var(--u-text-secondary);
  }
</style>
