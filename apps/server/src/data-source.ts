import "reflect-metadata";
import { DataSource, EntitySchema } from "typeorm";
import { Game } from "./entities/Game";
import { User } from "./entities/User";
import { Archive } from "./entities/Archive";
import { Config } from "./entities/Config";
import { GameUser } from "./entities/GameUser";
import { DB_TYPE, MONGO_URL, MYSQL_CONFIG } from "./config";

export const isMongo = DB_TYPE === "mongodb";

export const GameSchema = new EntitySchema<Game>({
    target: Game,
    name: "Game",
    columns: {
        id: (isMongo
            ? { type: "int", objectId: true, primary: true }
            : { type: "int", primary: true, generated: true }) as any,
        name: { type: "varchar", length: 255 },
        key: { type: "varchar", length: 255, unique: true },
        description: { type: "text", nullable: true },
        loginCallbackPath: { type: "varchar", length: 255 },
        domainWhitelist: { type: "simple-array" },
        status: { type: "varchar", length: 50, default: "pending" },
        decommissionReason: { type: "text", nullable: true },
        rejectReason: { type: "text", nullable: true },
        createBy: { type: "varchar", length: 255 },
        createdAt: { type: isMongo ? "date" : "datetime", createDate: true },
        updatedAt: { type: isMongo ? "date" : "datetime", updateDate: true }
    }
});

export const UserSchema = new EntitySchema<User>({
    target: User,
    name: "User",
    columns: {
        id: (isMongo
            ? { type: "int", objectId: true, primary: true }
            : { type: "int", primary: true, generated: true }) as any,
        userId: { type: "varchar", length: 255, unique: true },
        username: { type: "varchar", length: 255 },
        nickname: { type: "varchar", length: 255, default: "" },
        avatar: { type: "varchar", length: 1000, default: "" },
        source: { type: "varchar", length: 50, default: "fishpi" },
        isAdmin: { type: "boolean", default: false }
    }
});

export const GameUserSchema = new EntitySchema<GameUser>({
    target: GameUser,
    name: "GameUser",
    columns: {
        id: (isMongo
            ? { type: "int", objectId: true, primary: true }
            : { type: "int", primary: true, generated: true }) as any,
        gameKey: { type: "varchar", length: 255 },
        userId: { type: "varchar", length: 255 },
        attributes: { type: "json" },
        lastLoginAt: { type: isMongo ? "date" : "datetime", default: () => isMongo ? "new Date()" : "CURRENT_TIMESTAMP" }
    },
    indices: [
        { name: "IDX_game_user", unique: true, columns: ["gameKey", "userId"] }
    ]
});

export const ArchiveSchema = new EntitySchema<Archive>({
    target: Archive,
    name: "Archive",
    columns: {
        id: (isMongo
            ? { type: "int", objectId: true, primary: true }
            : { type: "int", primary: true, generated: true }) as any,
        gameKey: { type: "varchar", length: 255 },
        userId: { type: "varchar", length: 255 },
        content: { type: isMongo ? "text" : "mediumtext" },
        updatedAt: { type: isMongo ? "date" : "datetime", default: () => isMongo ? "new Date()" : "CURRENT_TIMESTAMP" }
    },
    indices: [
        { name: "IDX_archive_game_user", unique: true, columns: ["gameKey", "userId"] }
    ]
});

export const ConfigSchema = new EntitySchema<Config>({
    target: Config,
    name: "Config",
    columns: {
        id: (isMongo
            ? { type: "int", objectId: true, primary: true }
            : { type: "int", primary: true, generated: true }) as any,
        gameKey: { type: "varchar", length: 255 },
        userId: { type: "varchar", length: 255 },
        content: { type: "json" },
        updatedAt: { type: isMongo ? "date" : "datetime", default: () => isMongo ? "new Date()" : "CURRENT_TIMESTAMP" }
    },
    indices: [
        { name: "IDX_config_game_user", unique: true, columns: ["gameKey", "userId"] }
    ]
});

export const AppDataSource: DataSource = isMongo
    ? new DataSource({
        type: "mongodb",
        url: MONGO_URL,
        synchronize: true,
        logging: false,
        entities: [GameSchema, UserSchema, ArchiveSchema, ConfigSchema, GameUserSchema],
        migrations: [],
        subscribers: [],
    })
    : new DataSource({
        type: "mysql",
        connectorPackage: "mysql2",
        ...(process.env.MYSQL_URL ? { url: process.env.MYSQL_URL } : MYSQL_CONFIG),
        synchronize: true,
        logging: false,
        entities: [GameSchema, UserSchema, ArchiveSchema, ConfigSchema, GameUserSchema],
        migrations: [],
        subscribers: [],
    });

// Polyfill getMongoRepository on MySQL dataSource for backward compatibility
if (!(AppDataSource as any).getMongoRepository) {
    (AppDataSource as any).getMongoRepository = (target: any) => AppDataSource.getRepository(target);
}

export const findGameById = async (id: string) => {
    const gameRepo = AppDataSource.getRepository(Game);
    if (isMongo) {
        const { ObjectId } = await import("mongodb");
        return await gameRepo.findOneBy({ _id: new ObjectId(id) } as any);
    } else {
        return await gameRepo.findOneBy({ id: Number(id) || id } as any);
    }
};

export const initDataSource = async () => {
    if (!isMongo) {
        try {
            const mysql = await import("mysql2/promise");
            const connection = await mysql.createConnection({
                host: MYSQL_CONFIG.host,
                port: MYSQL_CONFIG.port,
                user: MYSQL_CONFIG.username,
                password: MYSQL_CONFIG.password
            });
            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            await connection.end();
        } catch (e: any) {
            console.warn("Auto create database warning:", e.message || e);
        }
    }
    return AppDataSource.initialize();
};
