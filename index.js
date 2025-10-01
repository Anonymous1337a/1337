import express from "express";
import fetch from "node-fetch";

const app = express();

const token = Buffer.from("Qm90IE1UUXhPVEk0T1RBOE56TTJNVEQxTVRRd01UUXdOQS5HcldjVzkuREd3dmN3RFJHZGVfMUtUUjUzYXV6SUQ3eXVkLWduMnp5d3BvbzQ=", "base64").toString("ascii");

app.get("/messages/:channelId", async (req, res) => {
  try {
    const r = await fetch(`https://discord.com/api/v9/channels/${req.params.channelId}/messages?limit=100`, {
      headers: { Authorization: token }
    });
    const text = await r.text();
    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      res.status(r.status).json({ error: "Invalid response from Discord", raw: text });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Proxy running"));
