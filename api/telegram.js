import axios from "axios";

export default async function handler(req, res) {
  // --- CONFIGURATION (HARDCODED FOR TESTING) ---
  const BOT_TOKEN = "7988880234:AAF4dbxs7ddB5_Hao2nQCgz3nici8iwJo04";
  const GROQ_API_KEY = "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";
  // ---------------------------------------------

  // 1. Basic Check: Ensure it is a POST request
  if (req.method !== "POST") {
    return res.status(200).send("ok");
  }

  // 2. Get the message from Telegram
  const { body } = req;
  const message = body.message;

  // If no text, just stop
  if (!message || !message.text) {
    return res.status(200).send("ok");
  }

  const chatId = message.chat.id;
  const userText = message.text;

  let replyText = "";

  try {
    // 3. Ask Groq AI for a response
    const aiResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", // Correct Groq Model
        messages: [
            { role: "system", content: "You are Misa, a helpful AI assistant." },
            { role: "user", content: userText }
        ],
      },
      {
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    replyText = aiResponse.data.choices[0].message.content;

  } catch (error) {
    console.error("AI Error:", error.response ? error.response.data : error.message);
    replyText = `Sorry, my brain is offline! Error: ${error.message}`;
  }

  try {
    // 4. Send the answer back to Telegram
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: replyText,
      }
    );
  } catch (e) {
    console.error("Telegram Error:", e.message);
  }

  // 5. Tell Telegram we received the message
  res.status(200).send("ok");
}

