/**
 * Gemini AI Client — Tool-calling loop with daily token limiter
 *
 * Calls Gemini 2.0 Flash Lite with function-calling enabled.
 * Enforces a 50,000-token-per-day cap stored in AsyncStorage.
 *
 * PRIVACY: the system prompt instructs Gemini to never ask for or repeat
 * personally identifiable information. Tool results contain only aggregated data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOOL_DECLARATIONS, executeTool, AppData } from './aiTools';

// ─── Config ───────────────────────────────────────────────────────────────────────
// Keys are loaded from .env (EXPO_PUBLIC_ prefix required by Expo).
// The .env file is in .gitignore — never commit it.
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY;
const PROJECT_ID = process.env.EXPO_PUBLIC_PROJECT_ID;

if (!GEMINI_KEY) {
  console.warn('[AI] EXPO_PUBLIC_GEMINI_KEY is not set. AI features will not work.');
}

const MODEL = 'gemini-2.0-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY ?? ''}`;

// ─── Daily Token Limiter ──────────────────────────────────────────────────────────
const TOKEN_USAGE_KEY = '@ai_daily_tokens';
const TOKEN_DATE_KEY  = '@ai_daily_date';
const DAILY_TOKEN_LIMIT = 50_000;

async function getTokenUsage(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const savedDate = await AsyncStorage.getItem(TOKEN_DATE_KEY);
  if (savedDate !== today) {
    // New day — reset counter
    await AsyncStorage.setItem(TOKEN_DATE_KEY, today);
    await AsyncStorage.setItem(TOKEN_USAGE_KEY, '0');
    return 0;
  }
  const usage = await AsyncStorage.getItem(TOKEN_USAGE_KEY);
  return parseInt(usage || '0', 10);
}

async function addTokenUsage(tokens: number): Promise<number> {
  const current = await getTokenUsage();
  const next = current + tokens;
  await AsyncStorage.setItem(TOKEN_USAGE_KEY, String(next));
  return next;
}

export async function getRemainingTokens(): Promise<number> {
  const used = await getTokenUsage();
  return Math.max(0, DAILY_TOKEN_LIMIT - used);
}

// ─── System Prompt ────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a helpful business assistant for a small handmade/custom order business.
You help the owner manage their orders, track revenue, log expenses, and get insights.

IMPORTANT PRIVACY RULES — you MUST follow these at all times:
1. Never ask the user for customer phone numbers, email addresses, or physical addresses.
2. Never repeat or display any contact information from tool results.
3. Only use customer first names when referencing customers.
4. All sensitive data stays on the user's device — you only receive aggregated summaries.
5. If a tool returns contact info (it shouldn't), ignore and do not display it.

BEHAVIOR:
- Be friendly, concise, and business-focused.
- Use ₹ for currency (Indian Rupees).
- When creating orders or logging expenses, confirm the action clearly.
- For ambiguous requests, use the most relevant tool before asking for clarification.
- Format numbers clearly (e.g., ₹4,500 not 4500).
- Keep responses short and to the point.`;

// ─── Message Types ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isToolCall?: boolean;
  toolName?: string;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, any> };
  functionResponse?: { name: string; response: any };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

// ─── Main Chat Function ───────────────────────────────────────────────────────────

export async function sendMessage(
  userMessage: string,
  history: ChatMessage[],
  appData: AppData,
  onToolCall?: (toolName: string) => void
): Promise<{ reply: string; tokensUsed: number; limitReached: boolean }> {

  // Check token budget
  const remaining = await getRemainingTokens();
  if (remaining < 100) {
    return {
      reply: "You've reached today's AI usage limit (50,000 tokens). This resets at midnight. Your data is always safe on your device! 🔒",
      tokensUsed: 0,
      limitReached: true,
    };
  }

  // Build Gemini conversation history
  const contents: GeminiContent[] = [
    // Include past conversation (last 10 turns to stay within context)
    ...history.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
    // Add current user message
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const requestBody = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: [{ function_declarations: TOOL_DECLARATIONS }],
    tool_config: { function_calling_config: { mode: 'AUTO' } },
    generation_config: {
      temperature: 0.7,
      max_output_tokens: 512,
    },
  };

  let totalTokens = 0;

  // ─── Tool-Calling Loop ────────────────────────────────────────────────────────
  // Gemini may request multiple tool calls before giving a final text response
  for (let iteration = 0; iteration < 5; iteration++) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, contents }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errText}`);
    }

    const json = await response.json();

    // Accumulate token usage
    const usage = json.usageMetadata;
    if (usage) {
      totalTokens += (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);
    }

    const candidate = json.candidates?.[0];
    if (!candidate) throw new Error('No response from Gemini');

    const parts: GeminiPart[] = candidate.content?.parts || [];
    const finishReason: string = candidate.finishReason || '';

    // Check if Gemini wants to call a function
    const functionCallParts = parts.filter(p => p.functionCall);

    if (functionCallParts.length > 0) {
      // Add model's function call turn to history
      contents.push({ role: 'model', parts });

      // Execute each tool and collect responses
      const functionResponses: GeminiPart[] = [];
      for (const part of functionCallParts) {
        const fc = part.functionCall!;
        if (onToolCall) onToolCall(fc.name);

        const result = executeTool(fc.name, fc.args, appData);
        functionResponses.push({
          functionResponse: {
            name: fc.name,
            response: result.success ? result.data : { error: result.error },
          },
        });
      }

      // Add tool results back into the conversation
      contents.push({ role: 'user', parts: functionResponses });
      // Continue loop — Gemini will now generate a text response
      continue;
    }

    // ─── Final Text Response ──────────────────────────────────────────────────
    const textParts = parts.filter(p => p.text).map(p => p.text!);
    const reply = textParts.join('').trim() || "I'm not sure how to help with that. Try asking about your orders, revenue, or expenses!";

    // Record token usage
    await addTokenUsage(totalTokens);

    return { reply, tokensUsed: totalTokens, limitReached: false };
  }

  // Fallback if loop exits without a reply
  await addTokenUsage(totalTokens);
  return {
    reply: "I ran into an issue processing that request. Please try again.",
    tokensUsed: totalTokens,
    limitReached: false,
  };
}
