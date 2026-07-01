const { Redis } = require('@upstash/redis');
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ADMIN_KEY = process.env.ADMIN_KEY || 'rotowire2025';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.query.admin !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const keys = await kv.keys('writein:*');
    const writeins = [];
    if (keys.length > 0) {
      const values = await Promise.all(keys.map(k => kv.get(k)));
      keys.forEach((k, i) => {
        const parts = k.split(':');
        const team = parts.slice(2).join(':');
        if (values[i]) writeins.push({ team, text: values[i] });
      });
    }
    return res.status(200).json(writeins);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
