import { runExport, exportMongoData } from './export';

export { exportMongoData };

if (require.main === module) {
    runExport().catch(err => {
        console.error('❌ 导出过程中发生错误:', err);
        process.exit(1);
    });
}
