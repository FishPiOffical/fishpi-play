import http from 'http';
import dotenv from 'dotenv';
dotenv.config();
import express from "express";
import "express-async-errors";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { IS_CONFIGURED, saveConfig } from "./config";
import router from "./router/index";
import { responseHandler, errorHandler } from "./middleware/response";
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(responseHandler);

app.get("/api/status", (req, res) => {
    res.json({ configured: IS_CONFIGURED });
});

app.use(express.static(path.join(__dirname, "public")));

// 端口监听
const port = process.env.PORT || 7998;

const server = http.createServer(app);
server.on('error', (error: any) => {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string'
        ? 'Pipe ' + port
        : 'Port ' + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
        default:
            throw error;
    }
});
server.on('listening', () => {
    const addr = server.address();
    if (!addr) return;
    const bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    console.log('Listening on ' + bind);
});

const wss = new WebSocketServer({ server });

export { ClientInfo } from './ws';
export { clients } from './ws';

if (IS_CONFIGURED) {
    import('./data-source').then(({ initDataSource }) => initDataSource()
        .then(() => {
            console.log("Data Source has been initialized!");

            // 注册 WebSocket 处理
            import('./ws').then(({ registerWebSocketServer }) => registerWebSocketServer(wss));

            // 挂载主路由
            app.use("/api", router);

            // 错误处理中间件
            app.use(errorHandler);

            // 启动服务器
            server.listen(port, () => {
                console.log(`Server is running at http://localhost:${port}`);
            });
        })
        .catch((error) => console.log(error)));
} else {
    app.post("/api/setup", (req, res) => {
        const { dbType = "mongodb", mongodb, mysql, jwtSecret, noticeGoldenKey, noticeUsers } = req.body;
        if (!jwtSecret) {
            return res.error("参数不完整: jwtSecret 必填");
        }
        if (dbType === "mysql") {
            if (!mysql || !mysql.host || !mysql.port || !mysql.database) {
                return res.error("MySQL 配置不完整");
            }
        } else if (dbType === "mongodb") {
            if (!mongodb || !mongodb.host || !mongodb.port || !mongodb.database) {
                return res.error("MongoDB 配置不完整");
            }
        } else {
            return res.error("不支持的数据库类型");
        }
        saveConfig({ dbType, mongodb, mysql, jwtSecret, noticeGoldenKey, noticeUsers });
        res.json({ message: "配置已保存，正在重启..." });
        setTimeout(() => process.exit(0), 1000);
    });

    // 静态文件重定向给 Vue Router
    app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "public", "index.html"));
    });

    server.listen(port, () => {
        console.log(`Server is running in SETUP MODE at http://localhost:${port}`);
    });
}

