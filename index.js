import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const token = process.env.DISCORD_TOKEN;

app.get("/messages/:channelId", async (req, res) => {
  try {
    const r = await fetch(`https://discord.com/api/v9/channels/${req.params.channelId}/messages?limit=100`, {
      headers: { Authorization: token }
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Proxy running");
});

app.post("/react/:channelId/:messageId/:emoji", async (req, res) => {
  try {
    await fetch(
      `https://discord.com/api/v9/channels/${req.params.channelId}/messages/${req.params.messageId}/reactions/${encodeURIComponent(req.params.emoji)}/@me`,
      {
        method: "PUT",
        headers: { Authorization: process.env.DISCORD_TOKEN }
      }
    );
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

