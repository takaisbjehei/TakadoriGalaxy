
import axios from "axios";

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
    // 3. Ask the AI (Groq) for a response
    // We use process.env.GROQ_API_KEY to get the key safely
    const aiResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-8b-8192", // You can change this model if needed
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
    console.error("AI Error:", error.message);
    replyText = "Sorry, my brain is having trouble connecting right now! 🧠";
  }

  try {
    // 4. Send the answer back to Telegram
    // We use process.env.BOT_TOKEN to get the token safely
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

  // 5. Tell Telegram we received the message (prevents spamming)
  res.status(200).send("ok");
}
