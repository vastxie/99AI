<script lang="ts" setup name="PersonalEditPassword">
  import useUserStore from '@/store/modules/user';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';

  import ApiUser from '@/api/modules/user';

  const router = useRouter();

  const userStore = useUserStore();

  const formRef = ref<FormInstance>();
  const form = ref({
    password: '',
    newpassword: '',
    checkpassword: '',
  });

  const rules = ref<FormRules>({
    password: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
    newpassword: [
      { required: true, message: '请输入新密码', trigger: 'blur' },
      { min: 6, max: 30, trigger: 'blur', message: '密码长度为 6 到 30 位' },
    ],
    checkpassword: [
      { required: true, message: '请再次输入新密码', trigger: 'blur' },
      {
        validator: (rule: any, value: any, callback: any) => {
          if (value !== form.value.newpassword) {
            callback(new Error('两次密码不一致！'));
          } else {
            callback();
          }
        },
      },
    ],
  });

  const submitting = ref(false);

  function onSubmit() {
    formRef.value?.validate(async (valid) => {
      if (!valid || submitting.value) return;
      submitting.value = true;
      try {
        const { password, newpassword } = form.value;
        await ApiUser.passwordEdit({ oldPassword: password, password: newpassword });
        ElMessage.success('密码已修改，请重新登录');
        await userStore.logout();
        router.push({ name: 'login' });
      } finally {
        submitting.value = false;
      }
    });
  }

  function goBack() {
    router.push({ name: 'personalSetting' });
  }
</script>

<template>
  <div>
    <page-panel>
      <el-row>
        <el-col :md="24" :lg="12">
          <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
            <el-form-item label="原密码" prop="password">
              <el-input
                v-model="form.password"
                type="password"
                placeholder="请输入原密码"
                show-password
              />
            </el-form-item>
            <el-form-item label="新密码" prop="newpassword">
              <el-input
                v-model="form.newpassword"
                type="password"
                placeholder="请输入新密码"
                show-password
              />
            </el-form-item>
            <el-form-item label="确认新密码" prop="checkpassword">
              <el-input
                v-model="form.checkpassword"
                type="password"
                placeholder="请再次输入新密码"
                show-password
              />
            </el-form-item>
            <el-form-item>
              <el-button @click="goBack">取消</el-button>
              <el-button type="primary" :loading="submitting" @click="onSubmit">保存</el-button>
            </el-form-item>
          </el-form>
        </el-col>
      </el-row>
    </page-panel>
  </div>
</template>
