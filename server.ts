import express from "express";
import { createServer as createViteServer } from "vite";
import RPC from "discord-rpc";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // Storage configuration
  const CONFIG_FILE = path.join(__dirname, "config.json");
  let storagePath = path.join(__dirname, "uploads");

  if (fs.existsSync(CONFIG_FILE)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    if (config.storagePath) storagePath = config.storagePath;
  }

  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  // Multer setup
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, storagePath);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + "-" + file.originalname);
    }
  });
  const upload = multer({ storage });

  // Discord RPC Integration
  const DISCORD_APP_ID = "1373652899661479989";
  try {
    const rpc = new RPC.Client({ transport: "ipc" });
    rpc.on("ready", () => {
      rpc.setActivity({
        details: "Idle in Harmonicon",
        largeImageKey: "harmonicon_icon",
        largeImageText: "Harmonicon Audio App",
        instance: false,
      });
    });
    rpc.login({ clientId: DISCORD_APP_ID }).catch(() => {});
  } catch (e) {}

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config", (req, res) => {
    res.json({ storagePath });
  });

  app.post("/api/config", (req, res) => {
    const { newPath } = req.body;
    if (newPath) {
      storagePath = newPath;
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ storagePath }));
      res.json({ success: true, storagePath });
    } else {
      res.status(400).json({ error: "Path required" });
    }
  });

  app.post("/api/upload", upload.single("audio"), (req: any, res) => {
    if (req.file) {
      res.json({ 
        success: true, 
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: `/uploads/${req.file.filename}`
      });
    } else {
      res.status(400).json({ error: "Upload failed" });
    }
  });

  // Serve uploaded files
  app.use("/uploads", express.static(storagePath));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        port: 3000,
        hmr: false
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
