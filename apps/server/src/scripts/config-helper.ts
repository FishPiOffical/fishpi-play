import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface MongoConfig {
    url: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
}

export interface MySQLConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    url?: string;
}

export const getOption = (names: string[], fallback?: string): string | undefined => {
    const args = process.argv;
    for (const name of names) {
        const idx = args.indexOf(name);
        if (idx !== -1 && idx + 1 < args.length) {
            return args[idx + 1];
        }
        const prefix = `${name}=`;
        const matched = args.find(a => a.startsWith(prefix));
        if (matched) {
            return matched.substring(prefix.length);
        }
    }
    return fallback;
};

export const hasFlag = (flags: string[]): boolean => {
    const args = process.argv;
    return flags.some(f => args.includes(f));
};

export function loadConfigFile(customPath?: string): { config: any; path: string | null } {
    const cliConfig = getOption(['--config', '-c'], customPath);
    const candidatePaths = [
        cliConfig,
        path.join(process.cwd(), 'config.json'),
        path.join(process.cwd(), 'apps', 'server', 'config.json'),
        path.resolve(__dirname, '../../config.json'),
        path.resolve(__dirname, '../../../config.json')
    ].filter(Boolean) as string[];

    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            try {
                const content = JSON.parse(fs.readFileSync(p, 'utf8'));
                return { config: content, path: p };
            } catch (e) {
                // ignore syntax error and continue
            }
        }
    }
    return { config: null, path: null };
}

export function resolveDatabaseType(defaultType: 'mongodb' | 'mysql' = 'mongodb'): 'mongodb' | 'mysql' {
    const cliType = getOption(['--type', '--dataType', '--dbType', '-t']);
    if (cliType) {
        const lower = cliType.toLowerCase();
        if (lower.includes('mongo')) return 'mongodb';
        if (lower.includes('mysql')) return 'mysql';
    }

    const { config } = loadConfigFile();
    if (config?.dbType) {
        const lower = config.dbType.toLowerCase();
        if (lower.includes('mongo')) return 'mongodb';
        if (lower.includes('mysql')) return 'mysql';
    }

    return defaultType;
}

export function resolveMongoConfig(): MongoConfig {
    const cliUrl = getOption(['--url', '-u', '--mongo-url']);
    if (cliUrl) {
        return { url: cliUrl };
    }

    if (process.env.MONGO_URL) {
        return { url: process.env.MONGO_URL };
    }

    const { config } = loadConfigFile();
    if (config?.mongodb) {
        const { user, password, host, port, database } = config.mongodb;
        const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password || '')}@` : '';
        const h = host || 'localhost';
        const p = port || 27017;
        const db = database || 'game-platform';
        return {
            url: `mongodb://${auth}${h}:${p}/${db}`,
            host: h,
            port: p,
            user,
            password,
            database: db
        };
    }

    return {
        url: 'mongodb://localhost:27017/game-platform',
        host: 'localhost',
        port: 27017,
        database: 'game-platform'
    };
}

export function resolveMySQLConfig(): MySQLConfig {
    const cliUrl = getOption(['--mysql-url', '--url']);
    if (cliUrl && cliUrl.startsWith('mysql')) {
        return {
            host: 'localhost',
            port: 3306,
            username: 'root',
            password: '',
            database: 'game-platform',
            url: cliUrl
        };
    }

    if (process.env.MYSQL_URL) {
        return {
            host: 'localhost',
            port: 3306,
            username: 'root',
            password: '',
            database: 'game-platform',
            url: process.env.MYSQL_URL
        };
    }

    const { config } = loadConfigFile();
    const confMy = config?.mysql;

    const host = getOption(['--host', '-h']) || process.env.MYSQL_HOST || confMy?.host || 'localhost';
    const port = Number(getOption(['--port', '-P']) || process.env.MYSQL_PORT || confMy?.port || 3306);
    const username = getOption(['--user', '-u', '--username']) || process.env.MYSQL_USER || confMy?.user || 'root';
    const password = getOption(['--password', '-p']) || process.env.MYSQL_PASSWORD || confMy?.password || '';
    const database = getOption(['--database', '-d']) || process.env.MYSQL_DATABASE || confMy?.database || 'game-platform';

    return { host, port, username, password, database };
}

export const sanitizeMongoUrl = (url: string): string => {
    return url.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1******$3');
};
