import fs from 'fs';
import path from 'path';
import { DataSource } from 'typeorm';
import { MongoClient } from 'mongodb';
import {
    getOption,
    hasFlag,
    loadConfigFile,
    resolveDatabaseType,
    resolveMySQLConfig,
    resolveMongoConfig,
    sanitizeMongoUrl,
    MySQLConfig,
    MongoConfig
} from './config-helper';

function readJsonFile<T = any>(filePath: string): T[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err: any) {
        console.warn(`⚠️  读取文件失败 [${filePath}]:`, err.message);
        return [];
    }
}

function deduplicate<T>(items: T[], keyFn: (item: T) => string, timeFn?: (item: T) => number): T[] {
    const map = new Map<string, T>();
    for (const item of items) {
        const key = keyFn(item);
        if (!key) continue;
        const existing = map.get(key);
        if (!existing) {
            map.set(key, item);
        } else if (timeFn) {
            const existingTime = timeFn(existing);
            const itemTime = timeFn(item);
            if (itemTime >= existingTime) {
                map.set(key, item);
            }
        }
    }
    return Array.from(map.values());
}

export async function importToMySQL(options?: {
    inputDir?: string;
    mysqlConfig?: MySQLConfig;
    updateConfigFile?: boolean;
    truncate?: boolean;
}) {
    const defaultDir = path.resolve(process.cwd(), getOption(['--dir', '-i', '--in']) || 'data/mongo-backup');
    const inputDir = options?.inputDir || defaultDir;
    const mysqlConfig = options?.mysqlConfig || resolveMySQLConfig();
    const shouldUpdateConfig = options?.updateConfigFile !== undefined ? options.updateConfigFile : !hasFlag(['--no-config-update']);
    const shouldTruncate = options?.truncate !== undefined ? options.truncate : hasFlag(['--truncate', '--clear']);

    console.log('========================================================');
    console.log('📥 正在导入数据至 [MySQL]');
    console.log(`📁 数据源目录: ${inputDir}`);
    console.log(`🔗 目标数据库: ${mysqlConfig.url ? mysqlConfig.url : `${mysqlConfig.username}@${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`}`);
    console.log('========================================================');

    if (!fs.existsSync(inputDir)) {
        throw new Error(`找不到数据源目录: ${inputDir}，请先执行导出脚本`);
    }

    // 1. 自动预建库（如果不存在）
    try {
        const mysql = await import('mysql2/promise');
        const conn = mysqlConfig.url 
            ? await mysql.createConnection(mysqlConfig.url)
            : await mysql.createConnection({
                host: mysqlConfig.host,
                port: mysqlConfig.port,
                user: mysqlConfig.username,
                password: mysqlConfig.password
            });
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${mysqlConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await conn.end();
        console.log(`✅ 目标数据库 \`${mysqlConfig.database}\` 就绪`);
    } catch (err: any) {
        console.warn('⚠️  自动建库预检警告（可能库已存在或无 root 权限）:', err.message || err);
    }

    // 2. 初始化 TypeORM MySQL 数据源并同步表结构
    process.env.DB_TYPE = 'mysql';
    const { GameSchema, UserSchema, ArchiveSchema, ConfigSchema, GameUserSchema } = await import('../data-source');
    const { Game } = await import('../entities/Game');
    const { User } = await import('../entities/User');
    const { GameUser } = await import('../entities/GameUser');
    const { Archive } = await import('../entities/Archive');
    const { Config } = await import('../entities/Config');

    const dataSource = new DataSource({
        type: 'mysql',
        connectorPackage: 'mysql2',
        ...(mysqlConfig.url ? { url: mysqlConfig.url } : {
            host: mysqlConfig.host,
            port: mysqlConfig.port,
            username: mysqlConfig.username,
            password: mysqlConfig.password,
            database: mysqlConfig.database,
        }),
        synchronize: true,
        logging: false,
        entities: [GameSchema, UserSchema, ArchiveSchema, ConfigSchema, GameUserSchema]
    });

    await dataSource.initialize();
    console.log('✅ TypeORM 数据表结构与索引初始化完成\n');

    const stats = {
        users: { read: 0, imported: 0 },
        games: { read: 0, imported: 0 },
        gameUsers: { read: 0, imported: 0 },
        archives: { read: 0, imported: 0 },
        configs: { read: 0, imported: 0 }
    };

    try {
        const userRepo = dataSource.getRepository(User);
        const gameRepo = dataSource.getRepository(Game);
        const gameUserRepo = dataSource.getRepository(GameUser);
        const archiveRepo = dataSource.getRepository(Archive);
        const configRepo = dataSource.getRepository(Config);

        if (shouldTruncate) {
            console.log('🧹 正在清空目标数据表 (--truncate 已开启)...');
            await archiveRepo.clear();
            await configRepo.clear();
            await gameUserRepo.clear();
            await gameRepo.clear();
            await userRepo.clear();
            console.log('   └─ 数据表已清空\n');
        }

        // 1. User
        const rawUsers = readJsonFile(path.join(inputDir, 'user.json'));
        stats.users.read = rawUsers.length;
        const dedupedUsers = deduplicate(rawUsers, u => u.userId);
        console.log(`👤 正在导入用户 [user.json] (读取: ${rawUsers.length}, 去重后: ${dedupedUsers.length})...`);
        for (const raw of dedupedUsers) {
            if (!raw.userId) continue;
            let user = await userRepo.findOneBy({ userId: raw.userId });
            if (!user) {
                user = userRepo.create({
                    userId: raw.userId,
                    username: raw.username || raw.userId,
                    nickname: raw.nickname || '',
                    avatar: raw.avatar || '',
                    source: raw.source || 'fishpi',
                    isAdmin: Boolean(raw.isAdmin)
                });
            } else {
                user.username = raw.username || user.username;
                user.nickname = raw.nickname !== undefined ? raw.nickname : user.nickname;
                user.avatar = raw.avatar !== undefined ? raw.avatar : user.avatar;
                user.source = raw.source || user.source;
                user.isAdmin = Boolean(raw.isAdmin);
            }
            await userRepo.save(user);
            stats.users.imported++;
        }
        console.log(`   └─ 成功导入/更新 ${stats.users.imported} 条用户数据\n`);

        // 2. Game
        const rawGames = readJsonFile(path.join(inputDir, 'game.json'));
        stats.games.read = rawGames.length;
        const dedupedGames = deduplicate(rawGames, g => g.key, g => new Date(g.updatedAt || g.createdAt || 0).getTime());
        console.log(`🎮 正在导入游戏 [game.json] (读取: ${rawGames.length}, 去重后: ${dedupedGames.length})...`);
        for (const raw of dedupedGames) {
            if (!raw.key || !raw.name) continue;
            let domainWhitelist: string[] = [];
            if (Array.isArray(raw.domainWhitelist)) {
                domainWhitelist = raw.domainWhitelist;
            } else if (typeof raw.domainWhitelist === 'string') {
                domainWhitelist = raw.domainWhitelist.split(',').map((s: string) => s.trim()).filter(Boolean);
            }

            let game = await gameRepo.findOneBy({ key: raw.key });
            const createdAt = raw.createdAt ? new Date(raw.createdAt) : new Date();
            const updatedAt = raw.updatedAt ? new Date(raw.updatedAt) : new Date();

            if (!game) {
                game = gameRepo.create({
                    name: raw.name,
                    key: raw.key,
                    description: raw.description,
                    loginCallbackPath: raw.loginCallbackPath || '',
                    domainWhitelist,
                    status: raw.status || 'pending',
                    decommissionReason: raw.decommissionReason,
                    rejectReason: raw.rejectReason,
                    createBy: raw.createBy || 'admin',
                    createdAt,
                    updatedAt
                });
            } else {
                game.name = raw.name;
                game.description = raw.description !== undefined ? raw.description : game.description;
                game.loginCallbackPath = raw.loginCallbackPath || game.loginCallbackPath;
                game.domainWhitelist = domainWhitelist;
                game.status = raw.status || game.status;
                game.decommissionReason = raw.decommissionReason;
                game.rejectReason = raw.rejectReason;
                game.createBy = raw.createBy || game.createBy;
                game.updatedAt = updatedAt;
            }
            await gameRepo.save(game);
            stats.games.imported++;
        }
        console.log(`   └─ 成功导入/更新 ${stats.games.imported} 条游戏数据\n`);

        // 3. GameUser
        const rawGameUsers = readJsonFile(path.join(inputDir, 'game_user.json'));
        stats.gameUsers.read = rawGameUsers.length;
        const dedupedGameUsers = deduplicate(rawGameUsers, gu => `${gu.gameKey}:::${gu.userId}`, gu => new Date(gu.lastLoginAt || 0).getTime());
        console.log(`👥 正在导入游戏玩家 [game_user.json] (读取: ${rawGameUsers.length}, 去重后: ${dedupedGameUsers.length})...`);
        for (const raw of dedupedGameUsers) {
            if (!raw.gameKey || !raw.userId) continue;
            let gameUser = await gameUserRepo.findOneBy({ gameKey: raw.gameKey, userId: raw.userId });
            const lastLoginAt = raw.lastLoginAt ? new Date(raw.lastLoginAt) : new Date();
            const attributes = raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : {};

            if (!gameUser) {
                gameUser = gameUserRepo.create({
                    gameKey: raw.gameKey,
                    userId: raw.userId,
                    attributes,
                    lastLoginAt
                });
            } else {
                gameUser.attributes = attributes;
                gameUser.lastLoginAt = lastLoginAt;
            }
            await gameUserRepo.save(gameUser);
            stats.gameUsers.imported++;
        }
        console.log(`   └─ 成功导入/更新 ${stats.gameUsers.imported} 条游戏玩家数据\n`);

        // 4. Archive
        const rawArchives = readJsonFile(path.join(inputDir, 'archive.json'));
        stats.archives.read = rawArchives.length;
        const dedupedArchives = deduplicate(rawArchives, a => `${a.gameKey}:::${a.userId}`, a => new Date(a.updatedAt || 0).getTime());
        console.log(`💾 正在导入游戏存档 [archive.json] (读取: ${rawArchives.length}, 去重后: ${dedupedArchives.length})...`);
        for (const raw of dedupedArchives) {
            if (!raw.gameKey || !raw.userId) continue;
            let archive = await archiveRepo.findOneBy({ gameKey: raw.gameKey, userId: raw.userId });
            const updatedAt = raw.updatedAt ? new Date(raw.updatedAt) : new Date();
            const content = typeof raw.content === 'string' ? raw.content : (raw.content ? JSON.stringify(raw.content) : '');

            if (!archive) {
                archive = archiveRepo.create({
                    gameKey: raw.gameKey,
                    userId: raw.userId,
                    content,
                    updatedAt
                });
            } else {
                archive.content = content;
                archive.updatedAt = updatedAt;
            }
            await archiveRepo.save(archive);
            stats.archives.imported++;
        }
        console.log(`   └─ 成功导入/更新 ${stats.archives.imported} 条存档数据\n`);

        // 5. Config
        const rawConfigs = readJsonFile(path.join(inputDir, 'config.json'));
        stats.configs.read = rawConfigs.length;
        const dedupedConfigs = deduplicate(rawConfigs, c => `${c.gameKey}:::${c.userId}`, c => new Date(c.updatedAt || 0).getTime());
        console.log(`⚙️  正在导入游戏配置 [config.json] (读取: ${rawConfigs.length}, 去重后: ${dedupedConfigs.length})...`);
        for (const raw of dedupedConfigs) {
            if (!raw.gameKey || !raw.userId) continue;
            let config = await configRepo.findOneBy({ gameKey: raw.gameKey, userId: raw.userId });
            const updatedAt = raw.updatedAt ? new Date(raw.updatedAt) : new Date();
            const content = raw.content !== undefined ? raw.content : {};

            if (!config) {
                config = configRepo.create({
                    gameKey: raw.gameKey,
                    userId: raw.userId,
                    content,
                    updatedAt
                });
            } else {
                config.content = content;
                config.updatedAt = updatedAt;
            }
            await configRepo.save(config);
            stats.configs.imported++;
        }
        console.log(`   └─ 成功导入/更新 ${stats.configs.imported} 条配置数据\n`);

        const countVerification = {
            users: await userRepo.count(),
            games: await gameRepo.count(),
            gameUsers: await gameUserRepo.count(),
            archives: await archiveRepo.count(),
            configs: await configRepo.count()
        };

        console.log('========================================================');
        console.log('📊 导入结果与 MySQL 最终数据统计核对:');
        console.log(`   • 用户 (User)       : 导入 ${stats.users.imported} 条 | 数据库现有 ${countVerification.users} 条`);
        console.log(`   • 游戏 (Game)       : 导入 ${stats.games.imported} 条 | 数据库现有 ${countVerification.games} 条`);
        console.log(`   • 游戏 (GameUser)   : 导入 ${stats.gameUsers.imported} 条 | 数据库现有 ${countVerification.gameUsers} 条`);
        console.log(`   • 存档 (Archive)    : 导入 ${stats.archives.imported} 条 | 数据库现有 ${countVerification.archives} 条`);
        console.log(`   • 配置 (Config)     : 导入 ${stats.configs.imported} 条 | 数据库现有 ${countVerification.configs} 条`);
        console.log('========================================================');

        // 更新配置文件
        if (shouldUpdateConfig) {
            const { path: cfgPath, config: currentConfig } = loadConfigFile();
            const targetPath = cfgPath || path.join(process.cwd(), 'config.json');
            const baseConfig = currentConfig || {};
            const newConfig = {
                ...baseConfig,
                dbType: 'mysql',
                mysql: {
                    host: mysqlConfig.host,
                    port: mysqlConfig.port,
                    database: mysqlConfig.database,
                    user: mysqlConfig.username,
                    password: mysqlConfig.password
                },
                jwtSecret: baseConfig.jwtSecret || process.env.JWT_SECRET || 'game-platform-secret'
            };
            fs.writeFileSync(targetPath, JSON.stringify(newConfig, null, 2), 'utf8');
            console.log(`📝 已自动将配置文件 [${targetPath}] 的 dbType 更新为 "mysql"`);
        }

        console.log('\n🎉 MySQL 数据导入完成！\n');
        return { stats, countVerification };
    } finally {
        await dataSource.destroy();
    }
}

export async function importToMongo(options?: {
    inputDir?: string;
    mongoConfig?: MongoConfig;
    truncate?: boolean;
}) {
    const defaultDir = path.resolve(process.cwd(), getOption(['--dir', '-i', '--in']) || 'data/mongo-backup');
    const inputDir = options?.inputDir || defaultDir;
    const mongoConf = options?.mongoConfig || resolveMongoConfig();
    const shouldTruncate = options?.truncate !== undefined ? options.truncate : hasFlag(['--truncate', '--clear']);

    console.log('========================================================');
    console.log('📥 正在导入数据至 [MongoDB]');
    console.log(`📁 数据源目录: ${inputDir}`);
    console.log(`🔗 目标数据库: ${sanitizeMongoUrl(mongoConf.url)}`);
    console.log('========================================================');

    if (!fs.existsSync(inputDir)) {
        throw new Error(`找不到数据源目录: ${inputDir}，请先执行导出脚本`);
    }

    const client = new MongoClient(mongoConf.url);
    await client.connect();
    console.log('✅ 已成功连接到 MongoDB\n');

    try {
        const db = client.db();
        const files: { file: string; collection: string; key: string }[] = [
            { file: 'user.json', collection: 'user', key: 'userId' },
            { file: 'game.json', collection: 'game', key: 'key' },
            { file: 'game_user.json', collection: 'game_user', key: 'gameKey_userId' },
            { file: 'archive.json', collection: 'archive', key: 'gameKey_userId' },
            { file: 'config.json', collection: 'config', key: 'gameKey_userId' }
        ];

        for (const item of files) {
            const rawDocs = readJsonFile(path.join(inputDir, item.file));
            const coll = db.collection(item.collection);

            if (shouldTruncate) {
                await coll.deleteMany({});
            }

            console.log(`🔄 正在导入 [${item.file}] 到 MongoDB 集合 [${item.collection}] (${rawDocs.length} 条)...`);
            let count = 0;
            for (const doc of rawDocs) {
                const { _id, ...rest } = doc;
                let filter: any = {};
                if (item.key === 'userId') filter = { userId: rest.userId };
                else if (item.key === 'key') filter = { key: rest.key };
                else filter = { gameKey: rest.gameKey, userId: rest.userId };

                await coll.updateOne(filter, { $set: rest }, { upsert: true });
                count++;
            }
            console.log(`   └─ 成功导入/更新 ${count} 条记录`);
        }

        console.log('\n🎉 MongoDB 数据导入完成！\n');
    } finally {
        await client.close();
    }
}

export async function runImport() {
    const { path: cfgPath } = loadConfigFile();
    if (cfgPath) {
        console.log(`ℹ️  已加载配置文件: ${cfgPath}`);
    }

    const targetType = resolveDatabaseType('mysql');
    if (targetType === 'mongodb') {
        return await importToMongo();
    } else {
        return await importToMySQL();
    }
}

if (require.main === module) {
    runImport().catch(err => {
        console.error('❌ 导入过程中发生错误:', err);
        process.exit(1);
    });
}
