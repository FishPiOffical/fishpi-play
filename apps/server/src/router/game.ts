import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Game } from "../entities/Game";
import { authenticate } from "../middleware/auth";
import { FingerTo } from "fishpi";
import { getConfig } from "../config";

const router = Router();
router.use(authenticate);

router.post("/register", async (req: any, res) => {
    const { name, key, loginCallbackPath, domainWhitelist, description } = req.body;
    const gameRepo = AppDataSource.getMongoRepository(Game);
    
    const existing = await gameRepo.findOne({
        where: {
            key,
            status: { $nin: ['rejected', 'decommissioned'] }
        }
    });
    if (existing) {
        return res.status(400).error('Game key already exists');
    }

    const game = gameRepo.create({
        name,
        key,
        loginCallbackPath,
        domainWhitelist,
        description,
        status: "pending",
        createBy: req.user.username, // Assuming req.user is populated by the authenticate middleware
        createdAt: new Date(),
        updatedAt: new Date()
    });
    await gameRepo.save(game);
    const config = getConfig();
    if (config) {
        const noticeFinger = FingerTo(config.noticeGoldenKey);
        config.noticeUsers.split(',').forEach(username => {
            noticeFinger.sendNotice(
              username.trim(), 
              `用户${req.user.username}发布了新的游戏《${game.name}》[待审核](https://play.adventext.fun/#/super-admin)`
            );
        });
    }
    res.json(game);
});

router.get("/", async (req: any, res) => {
    const { searchValue, status } = req.query;
    const gameRepo = AppDataSource.getMongoRepository(Game);
    
    const query: any = {};
    
    // 权限检查：非管理员只能看自己创建的游戏
    if (!req.user.isAdmin) {
        query.createBy = req.user.username;
    }
    
    if (status) {
        query.status = status;
    }
    
    if (searchValue) {
        const regex = { $regex: searchValue, $options: "i" };
        query.$or = [
            { name: regex },
            { key: regex },
            { description: regex }
        ];
    }

    const games = await gameRepo.find({ where: query });
    res.json(games);
});

export default router;
