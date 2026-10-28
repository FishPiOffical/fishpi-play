import { Router } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/profile", authenticate, async (req: any, res) => {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ userId: req.user.userId });
    res.json(user);
});

export default router;
