import { Router } from "express";
import { AppDataSource } from "../data-source";
import { GameUser } from "../entities/GameUser";
import { Archive } from "../entities/Archive";
import { Game } from "../entities/Game";
import { User } from "../entities/User";
import { clients } from "../index";
import { getOnlineUsers, sendToUserIds, sendToClientIds } from "../ws";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.use("/:gameKey", async (req: any, res, next) => {
    const { gameKey } = req.params;
    const gameRepo = AppDataSource.getMongoRepository(Game);
    const game = await gameRepo.findOneBy({ key: gameKey });
    
    if (!game) {
        return res.status(404).error("Game not found" );
    }

    // 检查当前用户是否有权限访问该游戏的路由
    if (req.user.username !== game.createBy && req.user.role !== "admin") {
        return res.status(403).error("Forbidden" );
    }

    req.game = game; // 将游戏信息附加到请求对象上，供后续路由使用

    next();
});

// 获取游戏用户列表（包含在线状态、属性、存档）
router.get("/:gameKey/users", async (req: any, res) => {
    const { gameKey } = req.params;
    const gameUserRepo = AppDataSource.getMongoRepository(GameUser);
    const userRepo = AppDataSource.getMongoRepository(User);
    const archiveRepo = AppDataSource.getMongoRepository(Archive);

    const users = await gameUserRepo.find({ where: { gameKey } });
    const userIds = users.map(u => u.userId);
    const userDetails = await userRepo.findBy({ userId: { $in: userIds } });
    
    // 聚合在线状态和存档信息
    const results = await Promise.all(users.map(async (user) => {
        const onlineDevices = Array.from(clients.entries())
            .filter(([id, info]) => info.gameKey === gameKey && info.userId === user.userId)
            .map(([id, info]) => ({
                clientId: id,
                attributes: info.attributes
            }));

        const lastArchive = await archiveRepo.findOne({
            where: { gameKey, userId: user.userId },
            order: { updatedAt: "DESC" }
        });

        return {
            userId: user.userId,
            ...userDetails.find(u => u.userId === user.userId),
            attributes: user.attributes,
            lastLoginAt: user.lastLoginAt,
            isOnline: onlineDevices.length > 0,
            onlineDevices,
            latestArchive: lastArchive ? {
                id: lastArchive.id,
                updatedAt: lastArchive.updatedAt,
                contentLength: lastArchive.content.length
            } : null
        };
    }));

    res.json(results);
});

// 设置游戏配置 (回调路径、域名白名单)
router.post("/:gameKey/config", async (req: any, res) => {
    const { gameKey } = req.params;
    const { loginCallbackPath, domainWhitelist, name } = req.body;
    
    const gameRepo = AppDataSource.getMongoRepository(Game);
    const game = req.game; // 从中间件获取游戏信息

    if (loginCallbackPath !== undefined) {
        game.loginCallbackPath = loginCallbackPath;
    }
    
    if (domainWhitelist !== undefined) {
        game.domainWhitelist = domainWhitelist;
    }
    if (name !== undefined && game.status !== 'approved') {
        game.name = name;
    }

    await gameRepo.save(game);
    res.json(game);
});

// 重新提交游戏申请（修改后将状态改为 pending）
router.post("/:gameKey/resubmit", async (req: any, res) => {
    const { loginCallbackPath, domainWhitelist, name, description, key: newKey } = req.body;
    const gameRepo = AppDataSource.getMongoRepository(Game);
    const game = req.game;

    // If updating key, ensure it doesn't collide with an existing active game
    if (newKey !== undefined && newKey !== game.key) {
        const conflict = await gameRepo.findOne({ where: { key: newKey, status: { $nin: ['rejected', 'decommissioned'] } } });
        if (conflict) {
            return res.status(400).error('Game key already exists');
        }
        game.key = newKey;
    }

    if (name !== undefined) game.name = name;
    if (description !== undefined) game.description = description;
    if (loginCallbackPath !== undefined) game.loginCallbackPath = loginCallbackPath;
    if (domainWhitelist !== undefined) game.domainWhitelist = domainWhitelist;

    game.status = 'pending';
    game.decommissionReason = undefined;
    game.updatedAt = new Date();

    await gameRepo.save(game);
    res.json(game);
});

// 获取特定用户的完整存档内容
router.get("/:gameKey/users/:userId/archive", async (req: any, res) => {
    const { gameKey, userId } = req.params;
    const archiveRepo = AppDataSource.getMongoRepository(Archive);
    
    const archive = await archiveRepo.findOne({
        where: { gameKey, userId },
        order: { updatedAt: "DESC" }
    });
    
    if (!archive) {
        return res.status(404).error("Archive not found" );
    }
    
    res.json(archive);
});

export default router;
