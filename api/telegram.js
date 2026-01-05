import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("ok");
  }

  const message = req.body.message;
  if (!message || !message.text) {
    return res.status(200).send("no message");
  }

  const chatId = message.chat.id;
  const userText = message.text;

  try {
    // Send message to your Grow API (Misa)
    const response = await axios.post(
      "https://YOUR-GROW-API.vercel.app/api/chat",
      {
        prompt: userText
      }
    );

    const reply =
      response.data.reply ||
      "uh— main thoda soch rahi hoon 🫣";

    // Send reply back to Telegram
    await axios.post(
      `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`,
      {
        chat_id: chatId,
        text: reply
      }
    );
  } catch (e) {
    console.error(e);
  }

  res.status(200).send("ok");
}
