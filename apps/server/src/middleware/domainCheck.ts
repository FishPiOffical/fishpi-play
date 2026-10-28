import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../data-source";
import { Game } from "../entities/Game";

export const domainCheck = async (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin || req.headers.referer;
    const gameKey = req.query.gameKey || req.body.gameKey || (req as any).user?.gameKey;

    if (!gameKey) {
        return next();
    }

    const gameRepo = AppDataSource.getRepository(Game);
    const game = await gameRepo.findOneBy({ key: gameKey as string });

    if (!game) {
        return res.status(404).json({ message: "Game not found" });
    }

    // 本地不做检查
    if (origin && (origin.startsWith("http://localhost") || origin.startsWith("http://127"))) {
        return next();
    }

    if (game.domainWhitelist && game.domainWhitelist.length > 0) {
        if (!origin) {
            return res.status(403).json({ message: "Origin required for this game" });
        }

        try {
            const originUrl = new URL(origin).hostname;
            const isWhitelisted = game.domainWhitelist.some(domain => {
                if (domain === "*") return true;
                return originUrl === domain || originUrl.endsWith("." + domain);
            });

            if (!isWhitelisted) {
                return res.status(403).json({ message: "Forbidden: Origin not in whitelist" });
            }
        } catch (e) {
            return res.status(400).json({ message: "Invalid Origin header" });
        }
    }

    next();
};
