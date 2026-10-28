import { Router } from "express";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../data-source";
import { Game } from "../entities/Game";
import { User } from "../entities/User";
import { JWT_SECRET } from "../config";
import { domainCheck } from "../middleware/domainCheck";
import FishPi from "fishpi";
import { GameUser } from "../entities/GameUser";

const router = Router();
const fishpi = new FishPi();

router.get("/login-url", domainCheck, async (req, res) => {
    const { gameKey, redirect } = req.query;
    let loginCallbackPath = '';
    if (!gameKey) {
      const url = new URL(req.headers.origin || req.headers.referer || '');
      // 如果没有提供 gameKey，表示当前网站登录
      loginCallbackPath = url.origin + '/#/login?loginVerify=fishpi';
    } else {
      const gameRepo = AppDataSource.getRepository(Game);
      const game = await gameRepo.findOneBy({ key: gameKey as string });
      
      if (!game) {
          return res.status(404).error("Game not found" );
      }
      
      if (game.status !== 'approved') {
        return res.status(403).error("Game not approved" );
      }
      const url = new URL(req.headers.origin || req.headers.referer || '');
      loginCallbackPath = url.origin + game.loginCallbackPath;
    }

    loginCallbackPath += (loginCallbackPath.includes('?') ? '&' : '?') + 'redirect=' + encodeURIComponent(redirect as string || '/');
    
    // 登录网关
    const loginUrl = fishpi.generateAuthURL(loginCallbackPath);
    res.json({ url: loginUrl });
});

router.post("/verify", async (req, res) => {
    const { gameKey, ...query } = req.body; // userInfo 从第三方或回跳携带
    
    const gameRepo = AppDataSource.getRepository(Game);
    const userRepo = AppDataSource.getRepository(User);
    
    if (gameKey) {
      const game = await gameRepo.findOneBy({ key: gameKey as string });
      if (!game) return res.status(404).error("Game not found" );
      if (game.status !== 'approved') {
        return res.status(403).error("Game not approved" );
      }
    }

    const userInfo = await fishpi.authVerify(query);
    if (!userInfo) {
        return res.status(400).error("Invalid auth code");
    }
    
    let user = await userRepo.findOneBy({ userId: userInfo.oId });
    if (!user) {
        const info = await fishpi.user(userInfo.userName);
        if (!info) {
            return res.status(404).error("User not found");
        }
        user = userRepo.create({
            userId: userInfo.oId,
            username: userInfo.userName,
            nickname: userInfo.userNickname || userInfo.userName,
            avatar: userInfo.userAvatarURL || "",
            source: "fishpi",
            isAdmin: info.role == '管理员' // Assuming '管理员' means admin in the FishPi system
        });
        await userRepo.save(user);

    } else {
        // 更新用户信息
        const info = await fishpi.user(userInfo.userName);
        if (info) {
            user.username = info.userName;
            user.nickname = info.userNickname;
            user.avatar = info.avatar;
            user.isAdmin = info.role == '管理员';
            await userRepo.save(user);
        }
    }
    
    const gameUserRepo = AppDataSource.getRepository(GameUser);
    if (gameKey) {
        const existingGameUser = await gameUserRepo.findOneBy({ gameKey: gameKey as string, userId: user.userId });
        if (!existingGameUser) {
            const gameUser = gameUserRepo.create({
                gameKey: gameKey as string,
                userId: user.userId,
                attributes: {},
                lastLoginAt: new Date()
            });
            await gameUserRepo.save(gameUser);
        } else {
            existingGameUser.lastLoginAt = new Date();
            await gameUserRepo.save(existingGameUser);
        }
    }

    const token = jwt.sign({ userId: user.userId.toString(), username: user.username.toString(), gameKey, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
});

export default router;
