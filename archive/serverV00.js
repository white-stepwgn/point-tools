import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// public フォルダの静的ファイル配信
app.use(express.static(path.join(__dirname, "public")));

// / で自動的に sr_live.html を返す
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/sr_live.html"));
});

// broadcast_key 取得 API
app.get("/get_broadcast_key", async (req, res) => {
    const roomId = req.query.room_id;
    if (!roomId) return res.status(400).json({ error: "room_id is required" });

    try {
        const response = await fetch(`https://www.showroom-live.com/api/live/live_info?room_id=${roomId}`);
        const data = await response.json();
        if (data.bcsvr_key) res.json({ broadcast_key: data.bcsvr_key });
        else res.status(404).json({ error: "broadcast_key not found" });
    } catch (e) {
        res.status(500).json({ error: e.toString() });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
