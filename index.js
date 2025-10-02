import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const token = process.env.DISCORD_TOKEN;

app.use(express.json({ limit: "10mb" }));

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

app.post("/react/:channelId/:messageId/:emoji", async (req, res) => {
  try {
    await fetch(
      `https://discord.com/api/v9/channels/${req.params.channelId}/messages/${req.params.messageId}/reactions/${encodeURIComponent(req.params.emoji)}/@me`,
      {
        method: "PUT",
        headers: { Authorization: token }
      }
    );
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/upload/:channelId", async (req, res) => {
  try {
    const { filename, content, message } = req.body;
    const boundary = "----DiscordBoundary" + Math.random().toString(16).slice(2);

    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="payload_json"\r\n\r\n` +
      JSON.stringify({ content: message || "" }) + "\r\n" +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename || "file.txt"}"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      content + "\r\n" +
      `--${boundary}--`;

    const response = await fetch(`https://discord.com/api/v9/channels/${req.params.channelId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": token,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Proxy running");
});

app.get("/ranker", async (req, res) => {
  const { userid, rank } = req.query;
  const groupId = process.env.GROUP_ID;

  try {
    let csrfToken = process.env.CSRF_TOKEN;

    let response = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `.ROBLOSECURITY=${process.env.ROBLOSECURITY}`,
        "x-csrf-token": csrfToken,
        "User-Agent": "Roblox/WinInet",
        "Origin": "https://www.roblox.com",
        "Referer": "https://www.roblox.com/"
      },
      body: JSON.stringify({ roleId: Number(rank) }),
    });

    // If Roblox rejects due to CSRF, get new token and retry
    if (response.status === 403) {
      const newToken = response.headers.get("x-csrf-token");
      if (newToken) {
        console.log("🔁 Refreshed CSRF token:", newToken);
        response = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Cookie": `.ROBLOSECURITY=${process.env.ROBLOSECURITY}`,
            "x-csrf-token": newToken,
            "User-Agent": "Roblox/WinInet",
            "Origin": "https://www.roblox.com",
            "Referer": "https://www.roblox.com/"
          },
          body: JSON.stringify({ roleId: Number(rank) }),
        });
      }
    }

    const text = await response.text();
    res.status(response.status).send(text);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
});
