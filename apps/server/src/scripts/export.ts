import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import {
    getOption,
    loadConfigFile,
    resolveDatabaseType,
    resolveMongoConfig,
    resolveMySQLConfig,
    sanitizeMongoUrl
} from './config-helper';

const ENTITY_COLLECTIONS: { key: string; candidates: string[] }[] = [
    { key: 'game', candidates: ['game', 'Game', 'games', 'Games'] },
    { key: 'user', candidates: ['user', 'User', 'users', 'Users'] },
    { key: 'game_user', candidates: ['game_user', 'GameUser', 'gameUsers', 'gameusers'] },
    { key: 'archive', candidates: ['archive', 'Archive', 'archives', 'Archives'] },
    { key: 'config', candidates: ['config', 'Config', 'configs', 'Configs'] }
];

export async function exportMongoData(customUrl?: string, customOutputDir?: string) {
    const mongoConf = resolveMongoConfig();
    const url = customUrl || mongoConf.url;
    const outDir = customOutputDir || path.resolve(process.cwd(), getOption(['--out', '-o', '--dir']) || 'data/mongo-backup');

    console.log('========================================================');
    console.log('📦 正在从 [MongoDB] 导出数据');
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
                console.log(`⚠️  未找到集合 [${item.key}]，导出为空数组`);
                const filePath = path.join(outDir, `${item.key}.json`);
                fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
                summary[item.key] = 0;
                continue;
            }

            console.log(`🔄 正在读取集合 [${actualName}] -> [${item.key}.json]...`);
            const collection = db.collection(actualName);
            const docs = await collection.find({}).toArray();

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

        const manifest = {
            exportedAt: new Date().toISOString(),
            sourceType: 'mongodb',
            sourceDatabase: db.databaseName,
            records: summary,
            collections: Object.keys(summary)
        };
        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

        console.log('\n========================================================');
        console.log('🎉 MongoDB 数据导出完成！各集合统计:');
        for (const [col, count] of Object.entries(summary)) {
            console.log(`   • ${col.padEnd(12)}: ${count} 条`);
        }
        console.log(`📄 文件保存在: ${outDir}`);
        console.log('========================================================\n');
        return { outDir, summary, sourceType: 'mongodb' };
    } finally {
        await client.close();
    }
}

export async function exportMySQLData(customOutputDir?: string) {
    const mysqlConf = resolveMySQLConfig();
    const outDir = customOutputDir || path.resolve(process.cwd(), getOption(['--out', '-o', '--dir']) || 'data/mysql-backup');

    console.log('========================================================');
    console.log('📦 正在从 [MySQL] 导出数据');
    console.log(`🔗 数据库连接: ${mysqlConf.username}@${mysqlConf.host}:${mysqlConf.port}/${mysqlConf.database}`);
    console.log(`📁 导出目录: ${outDir}`);
    console.log('========================================================');

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const mysql = await import('mysql2/promise');
    const conn = mysqlConf.url
        ? await mysql.createConnection(mysqlConf.url)
        : await mysql.createConnection({
            host: mysqlConf.host,
            port: mysqlConf.port,
            user: mysqlConf.username,
            password: mysqlConf.password,
            database: mysqlConf.database
        });

    console.log('✅ 已成功连接到 MySQL\n');

    try {
        const summary: Record<string, number> = {};

        const tableMap: Record<string, string> = {
            game: 'game',
            user: 'user',
            game_user: 'game_user',
            archive: 'archive',
            config: 'config'
        };

        for (const [key, tableName] of Object.entries(tableMap)) {
            console.log(`🔄 正在读取数据表 [${tableName}] -> [${key}.json]...`);
            try {
                const [rows] = await conn.query(`SELECT * FROM \`${tableName}\``);
                const records = Array.isArray(rows) ? (rows as any[]) : [];

                const normalized = records.map(row => {
                    const obj = { ...row };
                    if (key === 'game' && typeof obj.domainWhitelist === 'string') {
                        obj.domainWhitelist = obj.domainWhitelist.split(',').filter(Boolean);
                    }
                    if (key === 'user' && obj.isAdmin !== undefined) {
                        obj.isAdmin = Boolean(obj.isAdmin);
                    }
                    if (key === 'game_user' && typeof obj.attributes === 'string') {
                        try { obj.attributes = JSON.parse(obj.attributes); } catch (e) { /* ignore */ }
                    }
                    if (key === 'config' && typeof obj.content === 'string') {
                        try { obj.content = JSON.parse(obj.content); } catch (e) { /* ignore */ }
                    }
                    return obj;
                });

                fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(normalized, null, 2), 'utf8');
                summary[key] = normalized.length;
                console.log(`   └─ 成功导出 ${normalized.length} 条数据`);
            } catch (err: any) {
                console.warn(`⚠️  读取数据表 [${tableName}] 失败或不存在:`, err.message);
                fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify([], null, 2), 'utf8');
                summary[key] = 0;
            }
        }

        const manifest = {
            exportedAt: new Date().toISOString(),
            sourceType: 'mysql',
            sourceDatabase: mysqlConf.database,
            records: summary,
            collections: Object.keys(summary)
        };
        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

        console.log('\n========================================================');
        console.log('🎉 MySQL 数据导出完成！各数据表统计:');
        for (const [col, count] of Object.entries(summary)) {
            console.log(`   • ${col.padEnd(12)}: ${count} 条`);
        }
        console.log(`📄 文件保存在: ${outDir}`);
        console.log('========================================================\n');
        return { outDir, summary, sourceType: 'mysql' };
    } finally {
        await conn.end();
    }
}

export async function runExport() {
    const { path: cfgPath, config } = loadConfigFile();
    if (cfgPath) {
        console.log(`ℹ️  已加载配置文件: ${cfgPath}`);
    }

    const dbType = resolveDatabaseType('mongodb');
    if (dbType === 'mysql') {
        return await exportMySQLData();
    } else {
        return await exportMongoData();
    }
}

if (require.main === module) {
    runExport().catch(err => {
        console.error('❌ 导出过程中发生错误:', err);
        process.exit(1);
    });
}
