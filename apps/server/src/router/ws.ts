import { Router } from "express";
import { getOnlineUsers, getOnlineClients, sendToUserIds, sendToClientIds } from "../ws";
import { AppDataSource, isMongo } from "../data-source";
import { GameUser } from "../entities/GameUser";
import { User } from "../entities/User";
import { authenticate } from "../middleware/auth";
import { domainCheck } from "../middleware/domainCheck";
import { In } from "typeorm";

const router = Router();

// 应用全局中间件
router.use(authenticate);
router.use(domainCheck);

// 获取在线用户列表（按用户去重，包含每个设备）
router.get('/:gameKey/users', async (req: any, res) => {
    const { gameKey } = req.params;
    const online = getOnlineUsers(gameKey);

    const userIds = online.map(u => u.userId);
    const userRepo = AppDataSource.getRepository(User);
    const gameUserRepo = AppDataSource.getRepository(GameUser);

    const users = userIds.length > 0 
        ? await userRepo.find({ where: { userId: isMongo ? ({ $in: userIds } as any) : In(userIds) } }) 
        : [];
    const gameUsers = userIds.length > 0 
        ? await gameUserRepo.find({ where: { gameKey, userId: isMongo ? ({ $in: userIds } as any) : In(userIds) } }) 
        : [];

    const results = online.map(u => {
        const userDetail = users.find(x => x.userId === u.userId) || { userId: u.userId };
        const gameUser = gameUsers.find(x => x.userId === u.userId) || null;
        return {
            ...userDetail,
            userId: u.userId,
            attributes: gameUser ? gameUser.attributes : undefined,
            lastLoginAt: gameUser ? gameUser.lastLoginAt : undefined,
            devices: u.devices
        };
    });

    res.json(results);
});

router.get('/:gameKey/clients', async (req: any, res) => {
    const { gameKey } = req.params;
    const online = getOnlineClients(gameKey);

    const userIds = Array.from(new Set(online.map(c => c.userId)));
    const userRepo = AppDataSource.getRepository(User);
    const gameUserRepo = AppDataSource.getRepository(GameUser);

    const users = userIds.length > 0 
        ? await userRepo.find({ where: { userId: isMongo ? ({ $in: userIds } as any) : In(userIds) } }) 
        : [];
    const gameUsers = userIds.length > 0 
        ? await gameUserRepo.find({ where: { gameKey, userId: isMongo ? ({ $in: userIds } as any) : In(userIds) } }) 
        : [];

    const results = online.map(c => {
        const userDetail = users.find(u => u.userId === c.userId) || { userId: c.userId };
        return {
            ...userDetail,
            clientId: c.clientId,
            attributes: c.attributes
        };
    });

    res.json(results);
});

router.get('/:gameKey/:user/clients', async (req: any, res) => {
    const { gameKey, user } = req.params;
    const online = getOnlineClients(gameKey).filter(c => c.userId === user);

    const userRepo = AppDataSource.getRepository(User);
    const gameUserRepo = AppDataSource.getRepository(GameUser);

    const users = online.length > 0 
        ? await userRepo.find({ where: { userId: isMongo ? ({ $in: [user] } as any) : In([user]) } }) 
        : [];
    const gameUsers = online.length > 0 
        ? await gameUserRepo.find({ where: { gameKey, userId: isMongo ? ({ $in: [user] } as any) : In([user]) } }) 
        : [];

    const results = online.map(c => {
        const userDetail = users.find(u => u.userId === c.userId) || { userId: c.userId };
        return {
            ...userDetail,
            clientId: c.clientId,
            attributes: c.attributes
        };
    });

    res.json(results);
});

// 向指定用户或指定客户端发送消息。body: { userIds?: string[], clientIds?: string[], payload: any }
router.post('/:gameKey/send', async (req: any, res) => {
    const { gameKey } = req.params;
    const { userIds, clientIds, payload } = req.body;

    if ((!userIds || userIds.length === 0) && (!clientIds || clientIds.length === 0)) {
        return res.status(400).error('需要指定 userIds 或 clientIds');
    }

    // 仅在当前游戏范围内发送：过滤 userIds/clientIds
    let sent = 0;
    if (Array.isArray(userIds) && userIds.length > 0) {
        // 过滤只包含本游戏的用户（若某 userId 在别的 gameKey 下有连接，但请求中只想发送给本游戏，应限制）
        const targetUserIds = getOnlineUsers(gameKey).map(u => u.userId).filter(id => userIds.includes(id));
        sent += sendToUserIds(targetUserIds, { type: 'custom_message', payload });
    }

    if (Array.isArray(clientIds) && clientIds.length > 0) {
        // 只发送存在且属于本游戏的 clientIds
        const validClientIds = getOnlineUsers(gameKey).flatMap(u => u.devices.map(d => d.clientId)).filter(id => clientIds.includes(id));
        sent += sendToClientIds(validClientIds, { type: 'custom_message', payload });
    }

    res.json({ sent });
});

export default router;
