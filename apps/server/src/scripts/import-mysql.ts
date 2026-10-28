import { runImport, importToMySQL } from './import';

export { importToMySQL };

if (require.main === module) {
    runImport().catch(err => {
        console.error('❌ 导入过程中发生错误:', err);
        process.exit(1);
    });
}
