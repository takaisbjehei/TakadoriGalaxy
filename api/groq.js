// api/groq.js
export const config = {
  runtime: 'edge', // Required for streaming to work on Vercel
};

export default async function handler(req) {
  // 1. Security Check: Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // 2. Parse the incoming data from your App
    // We grab the 'model' you selected in the dropdown
    const { messages, model } = await req.json();

    // 3. Get your API Key from Vercel Settings
    const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server Error: Missing GROQ_API_KEY" }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Send the request to Groq
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        // Use the model selected in frontend (or default to Llama 3 if missing)
        model: model || 'openai/gpt-oss-120b', 
        messages: messages,
        stream: true, // <--- We force streaming ON here
        temperature: 0.7,
        max_tokens: 4096
      })
    });

    // 5. Check for errors from Groq (like "Invalid API Key" or "Rate Limit")
    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText, { status: response.status });
    }

    // 6. Return the stream directly to your phone
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    // Handle internal server errors
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
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
