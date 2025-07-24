// api/chat.js
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file in the parent directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const router = express.Router();

// Parse JSON bodies
router.use(express.json());

// Load and validate API keys
const OPENROUTER_KEYS = (process.env.OPENROUTER_KEYS || '')
    .split(',')
    .map(key => key.trim())
    .filter(key => key.startsWith('sk-or-v1-'));

if (OPENROUTER_KEYS.length === 0) {
    console.error("FATAL ERROR: No valid OpenRouter API keys found in OPENROUTER_KEYS environment variable.");
    process.exit(1);
}

let currentKeyIndex = 0;

/**
 * Rotates to the next API key in the list.
 */
function rotateKey() {
    currentKeyIndex = (currentKeyIndex + 1) % OPENROUTER_KEYS.length;
    console.log(`Rotating to API key index: ${currentKeyIndex}`);
}

/**
 * Attempts to get a response from OpenRouter using the current key.
 * @param {string} message - The user's message.
 * @returns {Promise<string|null>} - The AI's reply or null on failure.
 */
async function fetchFromOpenRouter(message) {
    const apiKey = OPENROUTER_KEYS[currentKeyIndex];
    const model = "deepseek-ai/deepseek-v1:free"; // You can make this configurable if needed

    const payload = {
        model: model,
        messages: [
            { role: "system", content: "You are a helpful and concise AI assistant." },
            { role: "user", content: message }
        ],
        temperature: 0.7
    };

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`API Error (${response.status}):`, errorData);
            // If it's a 401 or 403, the key might be bad, rotate it.
            if (response.status === 401 || response.status === 403) {
                console.warn(`Key ${currentKeyIndex} seems invalid or rate-limited. Rotating...`);
                rotateKey();
            }
            return null;
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || "No response generated.";
    } catch (error) {
        console.error(`Fetch failed with key ${currentKeyIndex}:`, error.message);
        // On network error, also rotate key
        rotateKey();
        return null;
    }
}

/**
 * Main POST route to handle chat requests.
 */
router.post('/', async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) {
        return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`Received message: ${userMessage}`);

    let reply = null;
    let attempts = 0;
    const maxAttempts = OPENROUTER_KEYS.length; // Try each key once

    while (attempts < maxAttempts && reply === null) {
        reply = await fetchFromOpenRouter(userMessage);
        attempts++;
        if (reply === null && attempts < maxAttempts) {
            console.log(`Attempt ${attempts} failed, trying next key...`);
            rotateKey(); // Move to the next key for the next attempt
        }
    }

    if (reply) {
        console.log(`Successfully generated reply.`);
        return res.json({ reply });
    } else {
        console.error('All API key attempts failed.');
        return res.status(503).json({ error: 'All AI services are currently unavailable. Please try again later.' });
    }
});

module.exports = router;
