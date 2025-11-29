// api/groq.js
export const config = {
  runtime: 'edge', // This is crucial for streaming!
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { messages, model, stream } = await req.json();
    
    // Make sure your Vercel Environment Variable is named GROQ_API_KEY
    // If you named it GROQ_KEY, change the line below to process.env.GROQ_KEY
    const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API Key" }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'llama3-8b-8192',
        messages: messages,
        stream: stream || false,
        temperature: 0.7
      })
    });

    // If Groq returns an error (like invalid key), forward it
    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText, { status: response.status });
    }

    // Pass the stream directly back to the frontend
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
