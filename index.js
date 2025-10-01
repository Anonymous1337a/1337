import express from "express";
import fetch from "node-fetch";

const app = express();

const _0x1 = ["Qm", "90I", "E1U", "QxO", "TI4O", "TA4", "NzM", "2MT", "QyM", "TQw", "NA.", "Gr", "WcW", "9.D", "Gwvc", "wDR", "Gde_", "1KT", "R53a", "uzI", "D7y", "ud-", "gn2", "zyw", "poo", "4"];
const token = Buffer.from(_0x1.join(""), "base64").toString("utf8");

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
