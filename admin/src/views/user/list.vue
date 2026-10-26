<script lang="ts" setup>
  import ApiUser from '@/api/modules/user';
  import { packUserListActions, packUserListColumns } from '@/packs';
  import { resolvePackComponent } from '@/core/packs/resolve';
  import type { UserStatus } from '@/constants/index';
  import {
    USER_STATUS_CHANGE_OPTIONS,
    USER_STATUS_MAP,
    USER_STATUS_OPTIONS,
    USER_STATUS_TAG_TYPE,
  } from '@/constants/index';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import type { FilterField } from '@/components/FilterBar/types';
  import useUserStore from '@/store/modules/user';

  const router = useRouter();
  const account = useUserStore();
  // 扩展包贡献的列与操作（如额度 / 套餐）；包删掉后列表自然只剩内核列
  const packColumns = packUserListColumns();
  const packActions = packUserListActions().map((action) => ({
    id: action.id,
    view: resolvePackComponent(action.id, action.component),
  }));
  const docUrl = computed(() => getDocUrl('/configuration/users/user-info'));
  usePageDoc(docUrl);

  const filterFields: FilterField[] = [
    { key: 'email', label: '用户邮箱', type: 'input', placeholder: '输入邮箱片段即可' },
    { key: 'phone', label: '手机号码', type: 'input', placeholder: '输入号码片段即可' },
    { key: 'nickname', label: '用户昵称', type: 'input', placeholder: '输入昵称片段即可' },
    {
      key: 'status',
      label: '用户状态',
      type: 'select',
      placeholder: '请选择用户状态',
      options: USER_STATUS_OPTIONS,
    },
  ];

  const visible = ref(false);
  const submitting = ref(false);

  const form = reactive({
    status: 0,
    id: 0,
  });

  const formInline = reactive({
    username: '',
    email: '',
    status: '',
    phone: '',
    nickname: '',
    page: 1,
    size: 20,
  });

  interface UserItem {
    avatar: string;
    email: string;
    id: number;
    uid?: string;
    lastLoginIp: string;
    role: string;
    status: UserStatus;
    username: string;
    createdAt: Date;
    updatedAt: Date;
    /** 计费扩展包提供的账户摘要（内核不解释） */
    billing?: Record<string, any> | null;
    nickname: string;
  }

  const {
    loading,
    total,
    tableData,
    query: queryAllUserList,
    search: searchUserList,
  } = usePagedTable<UserItem>(async () => {
    const res = await ApiUser.queryAllUser(formInline);
    return res.data;
  }, formInline);

  function handleUpdateStatus(row: UserItem) {
    // 后端 DTO 要求 status 为数值（IsIn [0,1,2,3]），选项 value 也是数值
    form.status = Number(row.status);
    form.id = row.id;
    visible.value = true;
  }

  function handleViewDetail(row: UserItem) {
    router.push(`/user/detail/${row.id}`);
  }

  async function handlerUpateUserStatus() {
    if (submitting.value) return;
    submitting.value = true;
    try {
      await ApiUser.updateUserStatus(form);
      ElMessage.success('用户状态已更新');
      visible.value = false;
      queryAllUserList();
    } finally {
      submitting.value = false;
    }
  }

  /** 后端生成随机临时密码并放在响应里返回，必须原样展示给管理员转交用户 */
  async function handlerResetUserPass(row: UserItem) {
    const res: any = await ApiUser.resetUserPassword({ id: row.id });
    const message =
      typeof res?.data === 'string' && res.data
        ? res.data
        : '密码已重置为临时密码，请通知用户尽快登录修改';
    await ElMessageBox.alert(message, `已重置 ${row.nickname || row.username} 的密码`, {
      confirmButtonText: '知道了',
    });
  }

  onMounted(() => queryAllUserList());
</script>

<template>
  <div>
    <page-panel>
      <FilterBar
        v-model:keyword="formInline.username"
        keyword-placeholder="搜索用户名"
        :fields="filterFields"
        :filters="formInline"
        class="mb-5"
        @update:filters="Object.assign(formInline, $event)"
        @apply="searchUserList"
        @reset="searchUserList"
      />
      <el-table v-loading="loading" border :data="tableData" style="width: 100%">
        <el-table-column label="用户" fixed min-width="230">
          <template #default="scope">
            <UserCell :user="scope.row" />
          </template>
        </el-table-column>
        <el-table-column prop="uid" label="UID" width="140">
          <template #default="scope">
            <span v-if="scope.row.uid" class="font-mono text-gray-600">{{ scope.row.uid }}</span>
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="200">
          <template #default="scope">
            <span v-if="scope.row.email">{{ scope.row.email }}</span>
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="150">
          <template #default="scope">
            <span v-if="scope.row.phone">{{ scope.row.phone }}</span>
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="USER_STATUS_TAG_TYPE[(row as UserItem).status] || 'info'">
              {{ USER_STATUS_MAP[(row as UserItem).status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- 扩展包贡献的列（如额度 / 会员信息） -->
        <el-table-column
          v-for="column in packColumns"
          :key="column.prop"
          :prop="column.prop"
          :label="column.label"
          :width="column.width"
          :align="column.align || 'left'"
        >
          <template v-if="column.formatter" #default="scope">
            {{ column.formatter(scope.row) }}
          </template>
        </el-table-column>
        <!-- <el-table-column prop="lastLoginIp" label="最后登录IP" width="140" align="center" /> -->
        <el-table-column prop="createdAt" label="注册时间" width="170">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="300">
          <template #default="scope">
            <el-button
              v-if="account.hasRole(['super'])"
              link
              type="primary"
              @click="handleViewDetail(scope.row as UserItem)"
            >
              详情
            </el-button>
            <el-button link type="primary" @click="handleUpdateStatus(scope.row as UserItem)">
              变更状态
            </el-button>
            <el-popconfirm
              title="将该用户的密码重置为随机临时密码？"
              confirm-button-text="确认重置"
              width="260"
              @confirm="handlerResetUserPass(scope.row as UserItem)"
            >
              <template #reference>
                <el-button link type="danger"> 重置密码 </el-button>
              </template>
            </el-popconfirm>
            <!-- 扩展包贡献的操作（自带弹窗），收到当前行与刷新回调 -->
            <component
              v-for="action in packActions"
              :key="action.id"
              :is="action.view"
              :row="scope.row"
              :refresh="queryAllUserList"
            />
          </template>
        </el-table-column>
      </el-table>
      <TablePager
        v-model:page="formInline.page"
        v-model:size="formInline.size"
        :total="total"
        @change="queryAllUserList"
      />
    </page-panel>

    <el-dialog v-model="visible" title="变更用户状态" width="500px">
      <el-form :model="form" label-width="auto">
        <el-form-item label="用户状态">
          <el-select v-model="form.status" placeholder="请选择用户状态" style="width: 160px">
            <el-option
              v-for="item in USER_STATUS_CHANGE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <DialogFooter
          :loading="submitting"
          @cancel="visible = false"
          @confirm="handlerUpateUserStatus"
        />
      </template>
    </el-dialog>
  </div>
</template>
