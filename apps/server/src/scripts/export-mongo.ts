import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// 解析命令行参数
const args = process.argv.slice(2);
const getArg = (flag: string, fallback?: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    const prefix = `${flag}=`;
    const matched = args.find(a => a.startsWith(prefix));
    if (matched) {
        return matched.substring(prefix.length);
    }
    return fallback;
};

// 读取默认配置
const configPath = path.join(process.cwd(), 'config.json');
let fileConfig: any = null;
if (fs.existsSync(configPath)) {
    try {
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        // ignore
    }
}

const resolveMongoUrl = (): string => {
    const cliUrl = getArg('--url') || getArg('-u');
    if (cliUrl) return cliUrl;

    if (process.env.MONGO_URL) return process.env.MONGO_URL;

    if (fileConfig?.mongodb) {
        const { user, password, host, port, database } = fileConfig.mongodb;
        const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password || '')}@` : '';
        return `mongodb://${auth}${host}:${port}/${database}`;
    }

    return 'mongodb://localhost:27017/game-platform';
};

const resolveOutputDir = (): string => {
    const cliOut = getArg('--out') || getArg('-o');
    if (cliOut) return path.resolve(process.cwd(), cliOut);
    return path.resolve(process.cwd(), 'data', 'mongo-backup');
};

const sanitizeMongoUrl = (url: string): string => {
    return url.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1******$3');
};

const ENTITY_COLLECTIONS: { key: string; candidates: string[] }[] = [
    { key: 'game', candidates: ['game', 'Game', 'games', 'Games'] },
    { key: 'user', candidates: ['user', 'User', 'users', 'Users'] },
    { key: 'game_user', candidates: ['game_user', 'GameUser', 'gameUsers', 'gameusers'] },
    { key: 'archive', candidates: ['archive', 'Archive', 'archives', 'Archives'] },
    { key: 'config', candidates: ['config', 'Config', 'configs', 'Configs'] }
];

export async function exportMongoData(mongoUrl?: string, outputDir?: string) {
    const url = mongoUrl || resolveMongoUrl();
    const outDir = outputDir || resolveOutputDir();

    console.log('========================================================');
    console.log('📦 MongoDB 数据导出工具');
    console.log(`🔗 连接地址: ${sanitizeMongoUrl(url)}`);
    console.log(`📁 导出目录: ${outDir}`);
    console.log('========================================================');

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const client = new MongoClient(url);
    await client.connect();
    console.log('✅ 已成功连接到 MongoDB\n');

    try {
        const db = client.db();
        const availableCollections = await db.listCollections().toArray();
        const availableNames = new Set(availableCollections.map(c => c.name));

        const summary: Record<string, number> = {};

        for (const item of ENTITY_COLLECTIONS) {
            const actualName = item.candidates.find(name => availableNames.has(name));
            if (!actualName) {
                console.log(`⚠️  未找到集合 [${item.key}]（查找别名: ${item.candidates.join(', ')}），导出为空数组`);
                const filePath = path.join(outDir, `${item.key}.json`);
                fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
                summary[item.key] = 0;
                continue;
            }

            console.log(`🔄 正在读取集合 [${actualName}] -> [${item.key}.json]...`);
            const collection = db.collection(actualName);
            const docs = await collection.find({}).toArray();

            // 规范化 ObjectId 和 Date 为便于序列化和迁移的标准数据格式
            const normalizedDocs = docs.map(doc => {
                const normalized: any = { ...doc };
                if (normalized._id) {
                    normalized._id = normalized._id.toString();
                }
                return normalized;
            });

            const filePath = path.join(outDir, `${item.key}.json`);
            fs.writeFileSync(filePath, JSON.stringify(normalizedDocs, null, 2), 'utf8');
            summary[item.key] = normalizedDocs.length;
            console.log(`   └─ 成功导出 ${normalizedDocs.length} 条数据`);
        }

        // 写入 manifest.json 记录导出元信息
        const manifest = {
            exportedAt: new Date().toISOString(),
            sourceDatabase: db.databaseName,
            records: summary,
            collections: Object.keys(summary)
        };
        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

        console.log('\n========================================================');
        console.log('🎉 导出完成！各集合统计如下:');
        for (const [col, count] of Object.entries(summary)) {
            console.log(`   • ${col.padEnd(12)}: ${count} 条`);
        }
        console.log(`📄 备份文件保存在: ${outDir}`);
        console.log('========================================================\n');
        return { outDir, summary };
    } finally {
        await client.close();
    }
}

if (require.main === module) {
    exportMongoData().catch(err => {
        console.error('❌ 导出过程中发生错误:', err);
        process.exit(1);
    });
}
