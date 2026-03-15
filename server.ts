import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

  app.use(express.json());

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    // Load .env file in development manually so server has it
    const dotenv = await import("dotenv");
    dotenv.config();

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {

    // Serve Config
    app.get("/api/config", (req, res) => {
      res.json({
        googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY,
        geminiApiKey: process.env.GEMINI_API_KEY,
      });
    });
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));

    // Catch-all route to serve the SPA for any unhandled paths
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";
  app.listen(PORT, host, () => {
    console.log(`Server running on http://${host}:${PORT}`);
  });
}

startServer();
