<template>
  <div class="register">
    <h2>游戏注册</h2>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" style="max-width: 500px">
      <el-form-item label="游戏名称" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="游戏 Key" prop="key">
        <el-input v-model="form.key" />
      </el-form-item>
      <el-form-item label="游戏描述" prop="description">
        <el-input v-model="form.description" type="textarea" placeholder="简要描述游戏功能" />
      </el-form-item>
      <el-form-item label="回调路径" prop="loginCallbackPath">
        <el-input v-model="form.loginCallbackPath" placeholder="/auth/callback" />
      </el-form-item>
      <el-form-item label="域名白名单" prop="domainWhitelist">
        <el-input v-model="form.domainWhitelist" placeholder="localhost,example.com" type="textarea" />
      </el-form-item>
      <el-form-item>
        <template v-if="editingGame">
          <el-button type="success" @click="resubmitChanges" style="margin-left:8px">保存并重新申请</el-button>
          <el-button @click="cancelEdit" style="margin-left:8px">取消</el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="onSubmit">提交申请</el-button>
        </template>
      </el-form-item>
    </el-form>

    <el-divider />

    <h3>待审批游戏</h3>
    <el-table :data="pendingGames" style="width: 100%">
      <el-table-column prop="name" label="游戏名称" />
      <el-table-column prop="key" label="游戏 Key" />
      <el-table-column prop="loginCallbackPath" label="回调路径" />
      <el-table-column prop="decommissionReason" label="下架/驳回原因">
        <template #default="scope">
          <span v-if="scope.row.decommissionReason || scope.row.rejectReason">
            {{ scope.row.decommissionReason || scope.row.rejectReason }}
          </span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态">
        <template #default="scope">
          <el-tag :type="scope.row.status === 'pending' ? 'warning' : (scope.row.status === 'rejected' ? 'danger' : 'info')">
            {{ scope.row.status === 'pending' ? '待审批' : (scope.row.status === 'rejected' ? '已驳回' : (scope.row.status === 'decommissioned' ? '已下架' : scope.row.status)) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作">
        <template #default="scope">
          <el-button size="small" type="primary" @click="startEdit(scope.row as Game)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { registerGame, getGames, type Game, updateGameConfig, resubmitGame } from '../api/game'

const form = ref({
  name: '',
  key: '',
  description: '',
  loginCallbackPath: '',
  domainWhitelist: ''
})
const formRef = ref()

const rules = {
  name: [{ required: true, message: '请填写游戏名称', trigger: 'blur' }],
  key: [{ required: true, message: '请填写游戏 Key', trigger: 'blur' }],
  description: [{ required: true, message: '请填写游戏描述', trigger: 'blur' }],
  loginCallbackPath: [{ required: true, message: '请填写回调路径', trigger: 'blur' }],
  domainWhitelist: [{ required: true, message: '请填写域名白名单', trigger: 'blur' }]
}

const pendingGames = ref<Game[]>([])
const editingGame = ref<Game | null>(null)

const startEdit = (game: Game) => {
  editingGame.value = game
  form.value = {
    name: game.name || '',
    key: game.key || '',
    description: game.description || '',
    loginCallbackPath: game.loginCallbackPath || '',
    domainWhitelist: (game.domainWhitelist || []).join(',')
  }
}

const cancelEdit = () => {
  editingGame.value = null
  form.value = {
    name: '',
    key: '',
    description: '',
    loginCallbackPath: '',
    domainWhitelist: ''
  }
}

const fetchPendingGames = async () => {
  try {
    const data = await getGames()
    // show pending, rejected and decommissioned games in the list
    pendingGames.value = data.filter(g => ['pending', 'rejected', 'decommissioned'].includes(g.status))
  } catch (err) {
    console.error('获取待审批游戏失败', err)
  }
}

onMounted(fetchPendingGames)

const onSubmit = async () => {
  try {
    await formRef.value.validate()
  } catch (err) {
    return
  }

  try {
    if (editingGame.value) {
      // only update config fields that backend supports
      await updateGameConfig(editingGame.value.key, {
        loginCallbackPath: form.value.loginCallbackPath,
        domainWhitelist: form.value.domainWhitelist.split(',').map(s => s.trim())
      })
      ElMessage.success('修改已保存')
      cancelEdit()
    } else {
      await registerGame({
        ...form.value,
        domainWhitelist: form.value.domainWhitelist.split(',').map(s => s.trim())
      })
      ElMessage.success('注册成功，等待审批')
      form.value = {
        name: '',
        key: '',
        description: '',
        loginCallbackPath: '',
        domainWhitelist: ''
      }
    }
    fetchPendingGames()
  } catch (err: any) {
    // http.ts handles error display via ElMessage.error usually
  }
}

const saveChanges = async () => {
  if (!editingGame.value) return
  try {
    await formRef.value.validate()
  } catch (err) {
    return
  }

  try {
    await updateGameConfig(editingGame.value.key, {
      loginCallbackPath: form.value.loginCallbackPath,
      domainWhitelist: form.value.domainWhitelist.split(',').map(s => s.trim())
    })
    ElMessage.success('修改已保存')
    cancelEdit()
    fetchPendingGames()
  } catch (err) {
    // handled by http
  }
}

const resubmitChanges = async () => {
  if (!editingGame.value) return
  try {
    await formRef.value.validate()
  } catch (err) {
    return
  }

  try {
    await resubmitGame(editingGame.value.key, {
      key: form.value.key,
      name: form.value.name,
      description: form.value.description,
      loginCallbackPath: form.value.loginCallbackPath,
      domainWhitelist: form.value.domainWhitelist.split(',').map(s => s.trim())
    })
    ElMessage.success('已重新提交申请')
    cancelEdit()
    fetchPendingGames()
  } catch (err) {
    // handled by http
  }
}
</script>
