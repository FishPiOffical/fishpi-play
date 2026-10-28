<template>
  <div class="config-page">
    <el-card class="config-card">
      <template #header>
        <div class="card-header">
          <h3>系统初始化配置</h3>
        </div>
      </template>
      <el-form :model="form" label-width="100px">
        <el-divider content-position="left">数据库配置</el-divider>
        <el-form-item label="数据库类型">
          <el-radio-group v-model="form.dbType">
            <el-radio label="mongodb">MongoDB</el-radio>
            <el-radio label="mysql">MySQL</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="form.dbType === 'mongodb'">
          <el-form-item label="Host">
            <el-input v-model="form.mongodb.host" placeholder="localhost" />
          </el-form-item>
          <el-form-item label="Port">
            <el-input-number v-model="form.mongodb.port" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="Database">
            <el-input v-model="form.mongodb.database" placeholder="game-platform" />
          </el-form-item>
          <el-form-item label="Username">
            <el-input v-model="form.mongodb.user" placeholder="可选" />
          </el-form-item>
          <el-form-item label="Password">
            <el-input v-model="form.mongodb.password" type="password" placeholder="可选" show-password />
          </el-form-item>
        </template>

        <template v-else-if="form.dbType === 'mysql'">
          <el-form-item label="Host">
            <el-input v-model="form.mysql.host" placeholder="localhost" />
          </el-form-item>
          <el-form-item label="Port">
            <el-input-number v-model="form.mysql.port" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="Database">
            <el-input v-model="form.mysql.database" placeholder="game-platform" />
          </el-form-item>
          <el-form-item label="Username">
            <el-input v-model="form.mysql.user" placeholder="root" />
          </el-form-item>
          <el-form-item label="Password">
            <el-input v-model="form.mysql.password" type="password" placeholder="可选" show-password />
          </el-form-item>
        </template>
        
        <el-divider content-position="left">安全配置</el-divider>
        <el-form-item label="JWT Secret">
          <el-input v-model="form.jwtSecret" placeholder="用于签发 Token 的密钥" />
        </el-form-item>

        <el-divider content-position="left">通知配置</el-divider>
        <el-form-item label="通知金钥">
          <el-input v-model="form.noticeGoldenKey" placeholder="用于发送通知的金钥" />
        </el-form-item>
        <el-form-item label="通知用户">
          <el-input v-model="form.noticeUsers" placeholder="接收通知的用户名，多个用户名用逗号分隔" />
        </el-form-item>
        
        <div class="submit-btn" style="text-align: center; margin-top: 20px;">
          <el-button type="primary" @click="handleSubmit" :loading="submitting" size="large">
            保存并重启后端
          </el-button>
        </div>
      </el-form>
      <div class="tip">
        <p>注意：点击保存后后端将生成 config.json 并尝试重启。请确保后端由 nodemon 或 pm2 等进程管理工具运行，以便自动恢复。</p>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { ElMessage } from 'element-plus';

const form = ref({
  dbType: 'mongodb' as 'mongodb' | 'mysql',
  mongodb: {
    host: 'localhost',
    port: 27017,
    database: 'game-platform',
    user: '',
    password: ''
  },
  mysql: {
    host: 'localhost',
    port: 3306,
    database: 'game-platform',
    user: 'root',
    password: ''
  },
  jwtSecret: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
  noticeGoldenKey: '',
  noticeUsers: ''
});

const submitting = ref(false);

const handleSubmit = async () => {
    submitting.value = true;
    try {
        const payload: any = {
            dbType: form.value.dbType,
            jwtSecret: form.value.jwtSecret,
            noticeGoldenKey: form.value.noticeGoldenKey,
            noticeUsers: form.value.noticeUsers
        };
        if (form.value.dbType === 'mysql') {
            payload.mysql = form.value.mysql;
        } else {
            payload.mongodb = form.value.mongodb;
        }

        // 使用原始 axios 以避免 http.ts 中的拦截器处理
        const { data } = await axios.post('/api/setup', payload);
        if (data.code === 0) {
            ElMessage.success('配置成功，系统正在重启...');
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        } else {
            ElMessage.error(data.msg || '保存失败');
        }
    } catch (e: any) {
        ElMessage.error(e.response?.data?.msg || '请求失败');
    } finally {
        submitting.value = false;
    }
};
</script>

<style scoped>
.config-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}
.config-card {
  width: 500px;
  border-radius: 12px;
}
.card-header h3 {
  margin: 0;
  text-align: center;
}
.tip {
  margin-top: 20px;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}
</style>
