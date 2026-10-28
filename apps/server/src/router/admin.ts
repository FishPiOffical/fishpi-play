import { Router } from "express";
import { AppDataSource, findGameById } from "../data-source";
import { Game } from "../entities/Game";
import { authenticate } from "../middleware/auth";
import { FingerTo } from "fishpi";
import { getConfig } from "../config";

const router = Router();
router.use(authenticate);

// Middleware to check if user is admin
router.use((req, res, next) => {
    if (!req.user.isAdmin) {
        return res.status(403).error("Forbidden: Admin access required");
    }
    next();
});

// Approve a game
router.post("/games/:id/approve", async (req, res) => {
    try {
        const gameRepo = AppDataSource.getRepository(Game);
        const game = await findGameById(req.params.id);
        
        if (!game) {
            return res.status(404).error("Game not found");
        }

        game.status = "approved";
        game.updatedAt = new Date();
        await gameRepo.save(game);
        
        res.json({ message: "Game approved successfully", game });
    } catch (err) {
        res.status(500).error("Failed to approve game");
    }
});

// Decommission a game
router.post("/games/:id/decommission", async (req, res) => {
    const { reason } = req.body;
    if (!reason) {
        return res.status(400).error("Decommission reason is required");
    }

    try {
        const gameRepo = AppDataSource.getRepository(Game);
        const game = await findGameById(req.params.id);
        
        if (!game) {
            return res.status(404).error("Game not found");
        }

        game.status = "decommissioned";
        game.decommissionReason = reason;
        game.updatedAt = new Date();
        await gameRepo.save(game);
        
        res.json({ message: "Game decommissioned successfully", game });
    } catch (err) {
        res.status(500).error("Failed to decommission game");
    }
});

// Reject a game (admin action) and notify the game author
router.post("/games/:id/reject", async (req, res) => {
    const { reason } = req.body;
    if (!reason) {
        return res.status(400).error("Reject reason is required");
    }

    try {
        const gameRepo = AppDataSource.getRepository(Game);
        const game = await findGameById(req.params.id);
        
        if (!game) {
            return res.status(404).error("Game not found");
        }

        game.status = "rejected";
        game.rejectReason = reason;
        game.updatedAt = new Date();
        await gameRepo.save(game);

        // send notice to the game's author
        const config = getConfig();
        if (config && config.noticeGoldenKey) {
            const noticeFinger = FingerTo(config.noticeGoldenKey);
            noticeFinger.sendNotice(
                game.createBy,
                `您的游戏《${game.name}》已被驳回：${reason}`
            );
        }

        res.json({ message: "Game rejected successfully", game });
    } catch (err) {
        res.status(500).error("Failed to reject game");
    }
});

export default router;
