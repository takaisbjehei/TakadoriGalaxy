// api/groq.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const key = process.env.GROQ_KEY;
  if (!key) return res.status(500).json({ error: 'GROQ_KEY missing in env' });

  const { model, input } = req.body || {};
  if (!model || typeof input === 'undefined') return res.status(400).json({ error: 'model and input required' });

  // Set GROQ_ENDPOINT in Vercel env if your provider uses a different base URL
  const GROQ_ENDPOINT = process.env.GROQ_ENDPOINT || 'https://api.groq.example/v1';

  try {
    const downstream = await fetch(`${GROQ_ENDPOINT}/models/${encodeURIComponent(model)}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({ input })
    });

    const status = downstream.status;
    const json = await downstream.json();
    return res.status(status).json(json);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message || 'proxy error' });
  }
}
