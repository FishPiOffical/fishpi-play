import path from 'path';
import { exportMongoData } from './export-mongo';
import { importMySQLData } from './import-mysql';

export async function runFullMigration() {
    console.log('🚀 开始全量数据迁移 (MongoDB -> 备份文件 -> MySQL)\n');

    const backupDir = path.resolve(process.cwd(), 'data', 'mongo-backup');

    // 步骤 1: 导出 MongoDB 数据
    console.log('>>> [第 1 步] 正在从 MongoDB 导出全量数据...');
    const exportResult = await exportMongoData(undefined, backupDir);

    console.log('\n>>> [第 2 步] 正在将数据导入 MySQL...');
    // 步骤 2: 导入 MySQL
    const importResult = await importMySQLData({
        inputDir: exportResult.outDir
    });

    console.log('========================================================');
    console.log('🏆 全流程迁移完成！');
    console.log(`📁 原始 MongoDB 数据已备份至: ${exportResult.outDir}`);
    console.log('💡 接下来你可以:');
    console.log('   1. 检查 MySQL 中的数据');
    console.log('   2. 启动服务 (npm run start 或 npm run dev)');
    console.log('   3. 关停并下线 MongoDB');
    console.log('========================================================\n');
}

if (require.main === module) {
    runFullMigration().catch(err => {
        console.error('❌ 迁移流程异常终止:', err);
        process.exit(1);
    });
}
