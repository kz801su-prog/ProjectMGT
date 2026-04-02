
import { GoogleGenAI } from "@google/genai";
import { Task } from "./types";

/**
 * AI Initialization
 * Initialize only if API key is provided, prevent crashing the whole app.
 */
let ai: any;
try {
  // Try Vite env first, then process.env
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : null) || 'DUMMY_KEY_TO_PREVENT_CRASH';
  ai = new GoogleGenAI({ apiKey });
} catch (e) {
  console.error("Gemini AI initialization failed:", e);
}

/**
 * Analyze whole project progress
 */
export const analyzeProgress = async (tasks: Task[]): Promise<string> => {
  const summary = tasks.map(t => ({
    title: t.title,
    person: t.responsiblePerson,
    status: t.status,
    priority: t.priority,
    latestProgress: t.progress.length > 0 ? t.progress[0].content : 'なし'
  }));

  const prompt = `
    取締役会決定事項の進捗リストを分析し、経営判断に必要なサマリーを日本語で作成してください。
    
    1. 全体の健全性（順調か遅延か）
    2. リスク案件の特定
    3. 次のアクション提案
    
    データ:
    ${JSON.stringify(summary)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    // Use .text property directly
    return response.text || "分析結果を取得できませんでした。";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "AI分析中にエラーが発生しました。接続環境を確認してください。";
  }
};

/**
 * Summarize individual task history
 */
export const summarizeTaskProgress = async (task: Task): Promise<string> => {
  if (!task.progress || task.progress.length === 0) return "履歴なし";

  const progressText = task.progress.map(p => p.content).join('\n');
  const prompt = `以下の進捗履歴を3行で要約してください:\n${progressText}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "要約不可";
  } catch (error) {
    return "要約エラー";
  }
};
