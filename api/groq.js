// api/groq.js
export const config = {
  runtime: 'edge', // Required for streaming on Vercel Edge
};

export default async function handler(req) {
  // Allow only POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Expect { messages: [...], model: "..." } from client
    const body = await req.json();
    const { messages, model } = body || {};

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Bad Request: messages array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Read API key from env (use GROQ_KEY or GROQ_API_KEY)
    const apiKey = process.env.GROQ_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server Error: Missing GROQ_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Build downstream request payload (OpenAI-compatible)
    const payload = {
      model: model || 'openai/gpt-oss-120b',
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024
    };

    // Call Groq streaming endpoint
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    // Forward non-OK responses (error bodies) back to client
    if (!groqRes.ok) {
      const errorText = await groqRes.text();
      return new Response(errorText, { status: groqRes.status });
    }

    // Stream response body back to the client as-is
    // We set text/event-stream so frontend can treat it as a stream
    return new Response(groqRes.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });

  } catch (err) {
    // Internal errors
    return new Response(JSON.stringify({ error: err?.message || 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
