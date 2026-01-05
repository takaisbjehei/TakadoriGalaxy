import axios from "axios"; // Fixed: lowercase 'import'

export default async function handler(req, res) {
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
        // Fixed: Use a valid Groq model
        model: "llama-3.3-70b-versatile", 
        messages: [
            { role: "system", content: "You are Misa, a helpful AI assistant." },
            { role: "user", content: userText }
        ],
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    replyText = aiResponse.data.choices[0].message.content;

  } catch (error) {
    console.error("AI Error:", error.response ? error.response.data : error.message);
    replyText = "Sorry, my brain is offline! 🧠 (Check Vercel Logs)";
  }

  try {
    // 4. Send the answer back to Telegram
    await axios.post(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
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

