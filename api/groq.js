export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    // 1. Get the 'stream' flag from the client (default to true if missing)
    const { messages, model, stream = true } = body || {};

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Bad Request: messages array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.GROQ_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server Error: Missing GROQ_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Pass the 'stream' flag to Groq
    const payload = {
      model: model || 'openai/gpt-oss-120b',
      messages: messages,
      stream: stream, // <--- Dynamic
      temperature: 0.7,
      max_tokens: 1024
    };

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!groqRes.ok) {
      const errorText = await groqRes.text();
      return new Response(errorText, { status: groqRes.status });
    }

    // 3. Return appropriate headers based on mode
    return new Response(groqRes.body, {
      headers: {
        'Content-Type': stream ? 'text/event-stream; charset=utf-8' : 'application/json',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
