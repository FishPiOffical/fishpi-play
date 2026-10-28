import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Archive } from "../entities/Archive";
import { Config } from "../entities/Config";
import { authenticate } from "../middleware/auth";
import { domainCheck } from "../middleware/domainCheck";

const router = Router();

// 应用全局中间件
router.use(authenticate);
router.use(domainCheck);

router.post("/archive", async (req: any, res) => {
    const { content } = req.body;
    if (typeof content !== 'string' || Buffer.byteLength(content) > 2 * 1024 * 1024) {
        return res.status(400).error("Content exceeds 2MB limit" );
    }
    const archiveRepo = AppDataSource.getRepository(Archive);
    let archive = await archiveRepo.findOneBy({ 
        gameKey: req.user.gameKey, 
        userId: req.user.userId 
    });
    if (archive) {
        archive.content = content;
        archive.updatedAt = new Date();
    } else {
        archive = archiveRepo.create({
            gameKey: req.user.gameKey,
            userId: req.user.userId,
            content,
            updatedAt: new Date()
        });
    }
    await archiveRepo.save(archive);
    res.json('OK');
});

router.get("/archive", async (req: any, res) => {
    const archiveRepo = AppDataSource.getRepository(Archive);
    const archive = await archiveRepo.findOneBy({ 
        gameKey: req.user.gameKey, 
        userId: req.user.userId 
    });
    res.json(archive ? { content: archive.content, updatedAt: archive.updatedAt } : null);
});

router.post("/config", async (req: any, res) => {
    const { content } = req.body;
    if (JSON.stringify(content).length > 10 * 1024) {
        return res.status(400).error("Content exceeds 10KB limit" );
    }
    const configRepo = AppDataSource.getRepository(Config);
    let config = await configRepo.findOneBy({ 
        gameKey: req.user.gameKey, 
        userId: req.user.userId 
    });
    if (config) {
        config.content = content;
        config.updatedAt = new Date();
    } else {
        config = configRepo.create({
            gameKey: req.user.gameKey,
            userId: req.user.userId,
            content,
            updatedAt: new Date()
        });
    }
    await configRepo.save(config);
    res.json('OK');
});

router.get("/config", async (req: any, res) => {
    const configRepo = AppDataSource.getRepository(Config);
    const config = await configRepo.findOneBy({ 
        gameKey: req.user.gameKey, 
        userId: req.user.userId 
    });
    res.json(config ? config.content : null);
});

export default router;
