// api/groq.js  — replace entire file with this
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const key = process.env.GROQ_KEY;
  if (!key) return res.status(500).json({ error: 'GROQ_KEY missing in env' });

  const { model, input } = req.body || {};
  if (!model || typeof input === 'undefined') return res.status(400).json({ error: 'model and input required' });

  // Use Groq's OpenAI-compatible chat completions endpoint
  const GROQ_ENDPOINT = process.env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1';

  try {
    const payload = {
      model,
      // send messages array (OpenAI-compatible)
      messages: [{ role: 'user', content: input }]
    };

    const downstream = await fetch(`${GROQ_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(payload)
    });

    const status = downstream.status;
    const json = await downstream.json();

    // Normalize common response shapes for the client
    // If Groq returns choices[0].message.content (OpenAI-style), expose it as `output`
    if (json && Array.isArray(json.choices) && json.choices[0]) {
      const choice = json.choices[0];
      // content may be in choice.message.content or choice.text depending on provider
      const text = (choice.message && choice.message.content) || choice.text || null;
      return res.status(status).json({ raw: json, output: text || json });
    }

    return res.status(status).json(json);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message || 'proxy error' });
  }
}
