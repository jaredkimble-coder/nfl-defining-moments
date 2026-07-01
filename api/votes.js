const { Redis } = require('@upstash/redis');
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ADMIN_KEY = process.env.ADMIN_KEY || 'rotowire2024';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ADMIN: /api/votes?admin=yourkey — view all write-ins
  if (req.method === 'GET' && req.query.admin) {
    if (req.query.admin !== ADMIN_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const keys = await kv.keys('writein:*');
      const writeins = [];
      if (keys.length > 0) {
        const values = await Promise.all(keys.map(k => kv.get(k)));
        keys.forEach((k, i) => {
          // key format: writein:{sessionId}:{team}
          const parts = k.split(':');
          const team = parts.slice(2).join(':');
          writeins.push({ team, text: values[i], session: parts[1] });
        });
      }
      // Group by team
      const grouped = {};
      writeins.forEach(w => {
        if (!grouped[w.team]) grouped[w.team] = [];
        grouped[w.team].push(w.text);
      });

      // Return nice HTML page
      const rows = Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([team, texts]) => `
        <tr>
          <td style="padding:10px 16px;font-weight:700;color:#fff;vertical-align:top;white-space:nowrap">${team}</td>
          <td style="padding:10px 16px;color:#8AA4BF">
            ${texts.map(t => `<div style="margin-bottom:6px;padding:8px 12px;background:#1A3054;border-radius:6px;color:#fff">${t}</div>`).join('')}
          </td>
        </tr>
      `).join('');

      const html = `<!DOCTYPE html><html><head><title>Write-in Votes — RotoWire</title>
      <meta charset="UTF-8">
      <style>body{background:#0D1B2E;color:#fff;font-family:-apple-system,sans-serif;padding:32px}
      h1{color:#F0314A;margin-bottom:8px}
      .sub{color:#8AA4BF;margin-bottom:24px;font-size:14px}
      table{width:100%;border-collapse:collapse}
      tr{border-bottom:1px solid #1E3A5F}
      tr:hover{background:#122338}
      </style></head><body>
      <h1>✏️ Write-in Votes</h1>
      <div class="sub">${writeins.length} total write-ins across ${Object.keys(grouped).length} teams</div>
      <table>${rows}</table>
      </body></html>`;

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET /api/votes — return all team vote counts
  if (req.method === 'GET') {
    try {
      const keys = await kv.keys('counts:*');
      const result = {};
      if (keys.length > 0) {
        const values = await Promise.all(keys.map(k => kv.get(k)));
        keys.forEach((k, i) => {
          result[k.replace('counts:', '')] = values[i] || [];
        });
      }
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST /api/votes — cast or change a vote
  if (req.method === 'POST') {
    try {
      const { sessionId, team, momentIndex, momentText } = req.body;
      if (!sessionId || !team || momentIndex === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const sessionKey = `session:${sessionId}:${team}`;
      const countsKey  = `counts:${team}`;

      const [prevVote, rawCounts] = await Promise.all([
        kv.get(sessionKey),
        kv.get(countsKey)
      ]);

      let counts = Array.isArray(rawCounts) ? [...rawCounts] : [];
      const maxIdx = Math.max(momentIndex, counts.length - 1, 10);
      while (counts.length <= maxIdx) counts.push(0);

      if (prevVote !== null && prevVote !== undefined && prevVote !== momentIndex) {
        counts[prevVote] = Math.max(0, (counts[prevVote] || 0) - 1);
      }

      if (prevVote !== momentIndex) {
        counts[momentIndex] = (counts[momentIndex] || 0) + 1;
      }

      const ops = [
        kv.set(countsKey, counts),
        kv.set(sessionKey, momentIndex),
      ];

      // Store write-in text if provided
      if (momentText) {
        ops.push(kv.set(`writein:${sessionId}:${team}`, momentText));
      }

      await Promise.all(ops);

      return res.status(200).json({ success: true, counts });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
