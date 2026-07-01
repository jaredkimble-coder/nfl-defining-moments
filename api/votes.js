const { Redis } = require('@upstash/redis');
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

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

      // Ensure array covers all indices
      const maxIdx = Math.max(momentIndex, counts.length - 1, 10);
      while (counts.length <= maxIdx) counts.push(0);

      // Undo previous vote if changing
      if (prevVote !== null && prevVote !== undefined && prevVote !== momentIndex) {
        counts[prevVote] = Math.max(0, (counts[prevVote] || 0) - 1);
      }

      // Only add vote if not re-voting for same option
      if (prevVote !== momentIndex) {
        counts[momentIndex] = (counts[momentIndex] || 0) + 1;
      }

      await Promise.all([
        kv.set(countsKey, counts),
        kv.set(sessionKey, momentIndex),
        momentText ? kv.set(`other:${sessionId}:${team}`, momentText) : Promise.resolve()
      ]);

      return res.status(200).json({ success: true, counts });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
  return res.status(405).json({ error: 'Method not allowed' });
};
