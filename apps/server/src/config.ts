import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'config.json');

export type DatabaseType = "mongodb" | "mysql";

export interface DatabaseConnectionConfig {
    host: string;
    port: number;
    user?: string;
    password?: string;
    database: string;
}

export interface AppConfig {
    dbType?: DatabaseType;
    mongodb?: DatabaseConnectionConfig;
    mysql?: DatabaseConnectionConfig;
    jwtSecret: string;
    noticeGoldenKey?: string;
    noticeUsers?: string;
}

let config: AppConfig | null = null;

if (fs.existsSync(configPath)) {
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.error('Failed to parse config.json', e);
    }
}

export const getConfig = () => config;

export const saveConfig = (newConfig: AppConfig) => {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
};

export const IS_CONFIGURED =
    !!config ||
    (process.env.DB_TYPE === "mysql" && (!!process.env.MYSQL_HOST || !!process.env.MYSQL_URL)) ||
    (process.env.DB_TYPE === "mongodb" && !!process.env.MONGO_URL);

export const JWT_SECRET = config?.jwtSecret || process.env.JWT_SECRET || "game-platform-secret";

export const DB_TYPE: DatabaseType =
    (process.env.DB_TYPE as DatabaseType) ||
    config?.dbType ||
    (config?.mysql && !config?.mongodb ? "mysql" : "mongodb");

export const MONGO_URL = config?.mongodb ? 
    `mongodb://${config.mongodb.user ? `${encodeURIComponent(config.mongodb.user)}:${encodeURIComponent(config.mongodb.password || '')}@` : ''}${config.mongodb.host}:${config.mongodb.port}/${config.mongodb.database}` : 
    process.env.MONGO_URL || "mongodb://localhost:27017/game-platform";

export const MYSQL_CONFIG = {
    host: config?.mysql?.host || process.env.MYSQL_HOST || "localhost",
    port: config?.mysql?.port || Number(process.env.MYSQL_PORT) || 3306,
    username: config?.mysql?.user !== undefined ? config.mysql.user : (process.env.MYSQL_USER !== undefined ? process.env.MYSQL_USER : "root"),
    password: config?.mysql?.password !== undefined ? config.mysql.password : (process.env.MYSQL_PASSWORD !== undefined ? process.env.MYSQL_PASSWORD : ""),
    database: config?.mysql?.database || process.env.MYSQL_DATABASE || "game-platform",
};
