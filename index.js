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
  try {
    let { userid, rank } = req.query;

    userid = Number(userid);
    rank = Number(rank);
    if (isNaN(userid) || isNaN(rank)) {
      return res.status(400).json({ error: "Invalid userid or rank" });
    }

    const groupId = Number(process.env.GROUP_ID);
    if (isNaN(groupId)) {
      return res.status(500).json({ error: "Invalid GROUP_ID in env" });
    }

    const headers = {
      "Cookie": `.ROBLOSECURITY=${process.env.ROBLOSECURITY}`,
      "User-Agent": "Roblox/WinInet",
      "Origin": "https://www.roblox.com",
      "Referer": "https://www.roblox.com/"
    };

    // Step 1: Fetch all group roles
    let rolesData;
    try {
      const rolesResp = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`, { headers });
      rolesData = await rolesResp.json();
    } catch (err) {
      return res.status(502).json({ error: "Failed to fetch group roles", details: err.message });
    }

    const validRoleIds = rolesData.roles.map(r => r.id);
    if (!validRoleIds.includes(rank)) {
      return res.status(400).json({ error: `Invalid roleId ${rank} for this group` });
    }

    // Step 2: Fetch user in group
    let userData;
    try {
      const userResp = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, { headers });
      userData = await userResp.json();
    } catch (err) {
      return res.status(502).json({ error: "Failed to fetch user", details: err.message });
    }

    if (!userData.role) {
      return res.status(400).json({ error: "User not in group" });
    }

    if (userData.role.id === rank) {
      return res.json({ status: "skipped", reason: "user already in role" });
    }

    // Step 3: Get fresh CSRF token
    let csrfToken;
    try {
      const tokenResp = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, {
        method: "PATCH",
        headers: { ...headers, "x-csrf-token": "" },
        body: "{}"
      });
      csrfToken = tokenResp.headers.get("x-csrf-token");
      if (!csrfToken) throw new Error("No CSRF token returned");
    } catch (err) {
      return res.status(502).json({ error: "Failed to fetch CSRF token", details: err.message });
    }

    // Step 4: PATCH to assign role
    let patchResp;
    try {
      patchResp = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({ roleId: rank })
      });

      // Retry once if CSRF token expired
      if (patchResp.status === 403) {
        const newToken = patchResp.headers.get("x-csrf-token");
        if (newToken) {
          patchResp = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, {
            method: "PATCH",
            headers: {
              ...headers,
              "Content-Type": "application/json",
              "x-csrf-token": newToken
            },
            body: JSON.stringify({ roleId: rank })
          });
        }
      }
    } catch (err) {
      return res.status(502).json({ error: "Failed to assign role", details: err.message });
    }

    const patchText = await patchResp.text();
    res.status(patchResp.status).send(patchText);

  } catch (err) {
    console.error("Proxy unexpected error:", err);
    res.status(500).json({ error: err.message });
  }
});
