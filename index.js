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

const ROBLOX_COOKIE = process.env.ROBLOSECURITY;
const GROUP_ID = process.env.GROUP_ID;
let CSRF_TOKEN = process.env.CSRF_TOKEN;

async function updateCsrf() {
  const r = await fetch("https://auth.roblox.com/v2/logout", {
    method: "POST",
    headers: { Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}` },
  });
  const newToken = r.headers.get("x-csrf-token");
  if (newToken) CSRF_TOKEN = newToken;
}

app.get("/ranker", async (req, res) => {
  const userid = req.query.userid;
  const roleId = req.query.rank;

  if (!userid || !roleId)
    return res.status(400).json({ error: "Missing userid or rank" });

  try {
    // Step 1: Check current group role
    const userCheck = await fetch(
      `https://groups.roblox.com/v1/groups/${GROUP_ID}/users/${userid}`,
      {
        headers: {
          Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
          "X-CSRF-TOKEN": CSRF_TOKEN,
        },
      }
    );

    if (userCheck.status === 404)
      return res.status(400).json({ error: "User not in group" });

    const userData = await userCheck.json();
    if (userData.role && userData.role.id == roleId)
      return res.json({ status: "skipped", reason: "already has role" });

    // Step 2: Change role
    const rankReq = await fetch(
      `https://groups.roblox.com/v1/groups/${GROUP_ID}/users/${userid}`,
      {
        method: "PATCH",
        headers: {
          Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": CSRF_TOKEN,
        },
        body: JSON.stringify({ roleId: Number(roleId) }),
      }
    );

    // Step 3: Handle CSRF refresh
    if (rankReq.status === 403) {
      await updateCsrf();
      const retry = await fetch(
        `https://groups.roblox.com/v1/groups/${GROUP_ID}/users/${userid}`,
        {
          method: "PATCH",
          headers: {
            Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
            "Content-Type": "application/json",
            "X-CSRF-TOKEN": CSRF_TOKEN,
          },
          body: JSON.stringify({ roleId: Number(roleId) }),
        }
      );
      const retryData = await retry.json();
      return res.status(retry.status).json(retryData);
    }

    const data = await rankReq.json();
    return res.status(rankReq.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Proxy running on port", process.env.PORT || 3000)
);
