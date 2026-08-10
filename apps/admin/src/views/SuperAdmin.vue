<template>
  <div class="super-admin">
    <h2>超级管理后台</h2>
    
    <div class="filter-container" style="margin-bottom: 20px; display: flex; gap: 10px;">
      <el-input
        v-model="queryParams.searchValue"
        placeholder="搜索名称、Key、描述"
        clearable
        style="width: 300px"
        @keyup.enter="fetchGames"
      />
      <el-select v-model="queryParams.status" placeholder="状态" clearable style="width: 150px" @change="fetchGames">
        <el-option label="待审批" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
        <el-option label="已下架" value="decommissioned" />
      </el-select>
      <el-button type="primary" @click="fetchGames">查询</el-button>
    </div>

    <el-table :data="games" style="width: 100%">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="key" label="Key" />
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="loginCallbackPath" label="回调路径" />
      <el-table-column prop="domainWhitelist" label="域名白名单">
        <template #default="scope">
          <div v-for="domain in scope.row.domainWhitelist" :key="domain">{{ domain }}</div>
        </template>
      </el-table-column>    
      <el-table-column prop="status" label="状态">
        <template #default="scope">
          <el-tooltip
            :disabled="!(scope.row.status === 'decommissioned' && scope.row.decommissionReason)"
            effect="dark"
            :content="'下架原因: ' + scope.row.decommissionReason"
            placement="top"
          >
            <el-tag :type="getStatusType(scope.row.status)">
              {{ scope.row.status }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="操作">
        <template #default="scope">
          <el-button 
            v-if="scope.row.status === 'pending'" 
            size="small" 
            type="success"
            @click="handleApprove(scope.row as any)"
          >批准</el-button>
          <el-button 
            v-if="scope.row.status === 'pending'"
            size="small" 
            type="danger"
            @click="handleReject(scope.row as any)"
          >驳回</el-button>
          <el-button 
            v-if="scope.row.status === 'approved'"
            size="small" 
            type="danger"
            @click="handleDecommission(scope.row as any)"
          >下架</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getGames, approveGame, decommissionGame, type Game, rejectGame } from '../api/game'
import { ElMessage, ElMessageBox } from 'element-plus'

const games = ref<Game[]>([])
const queryParams = ref({
  searchValue: '',
  status: ''
})

const getStatusType = (status: string) => {
  switch (status) {
    case 'approved': return 'success'
    case 'pending': return 'warning'
    case 'decommissioned': return 'info'
    default: return 'danger'
  }
}

const fetchGames = async () => {
  try {
    games.value = await getGames(queryParams.value)
  } catch (err) {
    console.error('获取游戏列表失败', err)
  }
}

const handleApprove = async (game: Game) => {
  try {
    await ElMessageBox.confirm(`确认批准游戏 "${game.name}" 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await approveGame(game.id)
    ElMessage.success('游戏已批准')
    fetchGames()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('批准失败', err)
      ElMessage.error('操作失败')
    }
  }
}

const handleDecommission = async (game: Game) => {
  try {
    const { value: reason } = await ElMessageBox.prompt(`请输入游戏 "${game.name}" 的下架原因`, '下架游戏', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /.+/,
      inputErrorMessage: '原因不能为空'
    })
    
    await decommissionGame(game.id, reason)
    ElMessage.success('游戏已下架')
    fetchGames()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('下架失败', err)
      ElMessage.error('操作失败')
    }
  }
}

const handleReject = async (game: Game) => {
  try {
    const { value: reason } = await ElMessageBox.prompt(`请输入游戏 "${game.name}" 的驳回原因`, '驳回游戏', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /.+/,
      inputErrorMessage: '原因不能为空'
    })
    
    await rejectGame(game.id, reason)
    ElMessage.success('游戏已驳回')
    fetchGames()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('驳回失败', err)
      ElMessage.error('操作失败')
    }
  }
}

onMounted(fetchGames)
</script>
