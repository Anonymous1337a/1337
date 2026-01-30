const DISCORD_TOKEN = DISCORD_TOKEN;
const ROBLOSECURITY = ROBLOSECURITY;
const CSRF_TOKEN = CSRF_TOKEN;
const GROUP_ID = Number(GROUP_ID);

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  try {
    if (pathname.startsWith("/messages/") && method === "GET") {
      const channelId = pathname.split("/")[2];
      const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages?limit=50`, {
        headers: { Authorization: `Bot ${DISCORD_TOKEN}` }
      });
      const data = await response.json();
      return json(data);
    }

    if (pathname.startsWith("/react/") && method === "POST") {
      const [_, __, channelId, messageId, emoji] = pathname.split("/");
      await fetch(`https://discord.com/api/v9/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, {
        method: "PUT",
        headers: { Authorization: `Bot ${DISCORD_TOKEN}` }
      });
      return json({ status: "ok" });
    }

    if (pathname.startsWith("/upload/") && method === "POST") {
      const channelId = pathname.split("/")[2];
      const body = await req.json();
      const { filename = "file.txt", content, message = "" } = body;

      const boundary = "----DiscordBoundary" + Math.random().toString(16).slice(2);
      const formData =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="payload_json"\r\n\r\n` +
        JSON.stringify({ content }) + "\r\n" +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: text/plain\r\n\r\n` +
        content + "\r\n" +
        `--${boundary}--`;

      const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_TOKEN}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: formData
      });

      const data = await response.json();
      return json(data);
    }

    if (pathname.startsWith("/ranker") && method === "GET") {
      const userid = Number(url.searchParams.get("userid"));
      const rank = Number(url.searchParams.get("rank"));
      if (!userid || !rank) return json({ error: "Invalid userid or rank" }, 400);

      const headers = {
        "Cookie": `.ROBLOSECURITY=${ROBLOSECURITY}`,
        "User-Agent": "Roblox/WinInet",
        "Origin": "https://www.roblox.com",
        "Referer": "https://www.roblox.com/"
      };

      const rolesRes = await fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/roles`, { headers });
      const rolesData = await rolesRes.json();
      const validRoleIds = rolesData.roles.map(r => r.id);
      if (!validRoleIds.includes(rank)) return json({ error: `Invalid roleId ${rank}` }, 400);

      const userRes = await fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/users/${userid}`, { headers });
      const userData = await userRes.json();
      if (userData.role && userData.role.id === rank) return json({ status: "skipped", reason: "user already in role" });

      let csrf = CSRF_TOKEN;
      let response = await fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/users/${userid}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ roleId: rank })
      });

      if (response.status === 403) {
        const newToken = response.headers.get("x-csrf-token");
        if (newToken) {
          response = await fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/users/${userid}`, {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json", "x-csrf-token": newToken },
            body: JSON.stringify({ roleId: rank })
          });
        }
      }

      const text = await response.text();
      return new Response(text, { status: response.status });
    }

    if (pathname.startsWith("/displayname") && method === "GET") {
      const name = url.searchParams.get("name")?.toLowerCase();
      if (!name) return json({ error: "Missing name parameter" }, 400);

      const guildsRes = await fetch("https://discord.com/api/v9/users/@me/guilds", {
        headers: { Authorization: `Bot ${DISCORD_TOKEN}` }
      });
      const guilds = await guildsRes.json();

      for (const guild of guilds) {
        const rolesRes = await fetch(`https://discord.com/api/v9/guilds/${guild.id}/roles`, {
          headers: { Authorization: `Bot ${DISCORD_TOKEN}` }
        });
        const roles = await rolesRes.json();

        let after = null;
        while (true) {
          const membersUrl = new URL(`https://discord.com/api/v9/guilds/${guild.id}/members`);
          membersUrl.searchParams.set("limit", "1000");
          if (after) membersUrl.searchParams.set("after", after);

          const membersRes = await fetch(membersUrl, { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
          if (!membersRes.ok) break;
          const members = await membersRes.json();

          const match = members.find(m => {
            const display = (m.nick || m.user.global_name || m.user.display_name || m.user.username || "").toLowerCase();
            return display.includes(name) || (m.user.username || "").toLowerCase().includes(name);
          });

          if (match) {
            const memberRoles = match.roles.map(roleId => {
              const role = roles.find(r => r.id === roleId);
              return role ? role.name : `Unknown (${roleId})`;
            });
            return json({
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

      return json({ error: "No matching user found" }, 404);
    }

    return new Response("Not Found", { status: 404 });

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
