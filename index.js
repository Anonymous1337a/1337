import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const token = process.env.DISCORD_TOKEN;

app.use(express.json({ limit: "10mb" }));

app.get("/messages/:channelId", async (req, res) => {
  if (!token) {
    return res.status(500).json({ error: "DISCORD_TOKEN not configured" });
  }

  const channelId = req.params.channelId;
  if (!channelId) {
    return res.status(400).json({ error: "Missing channelId" });
  }

  try {
    const r = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages?limit=100`, {
      headers: { Authorization: token }
    });

    const text = await r.text();

    try {
      const data = JSON.parse(text);
      return res.json(data);
    } catch {
      return res.status(502).json({
        error: "Upstream Discord returned non-JSON",
        rawPreview: text.slice(0, 200)
      });
    }
  } catch (err) {
    return res.status(500).json({ error: "Fetch failed", details: err.message });
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

    let rolesResponse = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`, {
      method: "GET",
      headers
    });
    const rolesData = await rolesResponse.json();
    const validRoleIds = rolesData.roles.map(r => r.id);

    if (!validRoleIds.includes(rank)) {
      return res.status(400).json({ error: `Invalid roleId ${rank} for this group` });
    }

    const userResponse = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, { headers });
    const userData = await userResponse.json();
    
    if (userData.role && userData.role.id === rank) {
        return res.json({ status: "skipped", reason: "user already in role" });
    }
    
    let csrfToken = process.env.CSRF_TOKEN;

    let response = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ roleId: rank })
    });
    
    if (response.status === 403) {
      const newToken = response.headers.get("x-csrf-token");
      if (newToken) {
        console.log("🔁 Refreshed CSRF token:", newToken);
        response = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userid}`, {
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

    const text = await response.text();
    res.status(response.status).send(text);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/displayname", async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Missing name parameter" });

    const guilds = await fetch("https://discord.com/api/v9/users/@me/guilds", {
      headers: { Authorization: token }
    });
    const guildList = await guilds.json();

    const search = name.toLowerCase();

    for (const guild of guildList) {
      let after = null;

      const rolesRes = await fetch(`https://discord.com/api/v9/guilds/${guild.id}/roles`, {
        headers: { Authorization: token }
      });
      const roles = await rolesRes.json();

      while (true) {
        const url = new URL(`https://discord.com/api/v9/guilds/${guild.id}/members`);
        url.searchParams.set("limit", "1000");
        if (after) url.searchParams.set("after", after);

        const r = await fetch(url, { headers: { Authorization: token } });
        if (!r.ok) break;

        const members = await r.json();

        const match = members.find(m => {
          const display = (m.nick || m.user.global_name || m.user.display_name || m.user.username || "").toLowerCase();
          const username = (m.user.username || "").toLowerCase();
          return display.includes(search) || username.includes(search);
        });

        if (match) {
          const memberRoles = match.roles.map(roleId => {
            const role = roles.find(r => r.id === roleId);
            return role ? role.name : `Unknown (${roleId})`;
          });

          return res.json({
            guild: guild.name,
            userid: match.user.id,
            username: match.user.username,
            displayname: match.nick || match.user.global_name || match.user.display_name || match.user.username,
            roles: memberRoles
          });
        }

        if (members.length < 1000) break;
        after = members[members.length - 1].user.id;
      }
    }

    res.status(404).json({ error: "No matching user found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

