import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { AppDataSource } from "./data-source";
import { GameUser } from "./entities/GameUser";
import { JWT_SECRET, IS_CONFIGURED } from "./config";

export interface ClientInfo {
    ws: WebSocket;
    userId: string;
    gameKey: string;
    attributes: any;
}

export const clients: Map<string, ClientInfo> = new Map();

export function registerWebSocketServer(wss: WebSocketServer) {
    if (!IS_CONFIGURED) return;

    wss.on("connection", (ws, req) => {
        if (!IS_CONFIGURED) {
            ws.close(1008, "Not Configured");
            return;
        }
        const url = new URL(req.url!, `http://${req.headers.host}`);
        const token = url.searchParams.get("token");

        if (!token) {
            ws.close(1008, "Token Required");
            return;
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            const userId = decoded.userId;
            const gameKey = decoded.gameKey;
            const clientId = `${userId}_${Math.random().toString(36).substring(7)}`;

            const clientInfo: ClientInfo = {
                ws,
                userId,
                gameKey,
                attributes: {}
            };
            clients.set(clientId, clientInfo);

            // 记录登录并同步属性
            const gameUserRepo = AppDataSource.getRepository(GameUser);
            (async () => {
                let gameUser = await gameUserRepo.findOneBy({ gameKey, userId });
                if (!gameUser) {
                    gameUser = gameUserRepo.create({
                        gameKey,
                        userId,
                        attributes: {},
                        lastLoginAt: new Date()
                    });
                } else {
                    gameUser.lastLoginAt = new Date();
                }
                await gameUserRepo.save(gameUser);
                clientInfo.attributes = gameUser.attributes || {};
                ws.send(JSON.stringify({ type: "attributes_sync", attributes: clientInfo.attributes }));
            })().catch(e => console.error("WS Login record error:", e));

            ws.on("message", async (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === "set_attributes") {
                        if (JSON.stringify(data.attributes).length > 1024) {
                            return ws.send(JSON.stringify({ error: "Attributes exceed 1KB" }));
                        }
                        clientInfo.attributes = data.attributes;

                        // 持久化属性
                        let gameUser = await gameUserRepo.findOneBy({ gameKey, userId });
                        if (gameUser) {
                            gameUser.attributes = data.attributes;
                            await gameUserRepo.save(gameUser);
                        }

                        ws.send(JSON.stringify({ type: "attributes_updated", attributes: clientInfo.attributes }));
                    } else if (data.type === "get_devices") {
                        const otherDevices = Array.from(clients.entries())
                            .filter(([id, info]) => info.userId === userId && id !== clientId)
                            .map(([id, info]) => ({
                                clientId: id,
                                gameKey: info.gameKey,
                                attributes: info.attributes
                            }));
                        ws.send(JSON.stringify({ type: "devices_info", devices: otherDevices }));
                    }
                } catch (e) {
                    console.error("WS Message Error:", e);
                }
            });

            ws.on("close", () => {
                clients.delete(clientId);
            });

        } catch (err) {
            ws.close(1008, "Invalid Token");
        }
    });
}

export default {
    registerWebSocketServer,
    clients,
};

/**
 * 返回指定游戏的在线客户端列表
 */
export function getOnlineClients(gameKey?: string) {
    return Array.from(clients.entries())
        .filter(([id, info]) => (gameKey ? info.gameKey === gameKey : true))
        .map(([id, info]) => ({ clientId: id, userId: info.userId, gameKey: info.gameKey, attributes: info.attributes }));
}

/**
 * 返回指定游戏的在线用户（去重，每个用户汇总其设备）
 */
export function getOnlineUsers(gameKey?: string) {
    const map = new Map<string, { userId: string; gameKey: string; devices: Array<{ clientId: string; attributes: any }> }>();
    for (const [id, info] of clients.entries()) {
        if (gameKey && info.gameKey !== gameKey) continue;
        const existing = map.get(info.userId);
        if (!existing) {
            map.set(info.userId, { userId: info.userId, gameKey: info.gameKey, devices: [{ clientId: id, attributes: info.attributes }] });
        } else {
            existing.devices.push({ clientId: id, attributes: info.attributes });
        }
    }
    return Array.from(map.values());
}

/**
 * 向指定用户 ID 列表发送消息（匹配所有连接的设备）
 * 返回发送的连接数量
 */
export function sendToUserIds(userIds: string[], payload: any) {
    let sent = 0;
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const [, info] of clients.entries()) {
        if (userIds.includes(info.userId)) {
            try {
                info.ws.send(data);
                sent++;
            } catch (e) {
                console.error('sendToUserIds error', e);
            }
        }
    }
    return sent;
}

/**
 * 向指定连接 ID 列表发送消息
 */
export function sendToClientIds(clientIds: string[], payload: any) {
    let sent = 0;
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const id of clientIds) {
        const info = clients.get(id);
        if (info) {
            try {
                info.ws.send(data);
                sent++;
            } catch (e) {
                console.error('sendToClientIds error', e);
            }
        }
    }
    return sent;
}
