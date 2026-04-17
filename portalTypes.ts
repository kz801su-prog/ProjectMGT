
// =========================================================
// ポータル（トップページ）用型定義
// =========================================================

/** 半期の期間定義 */
export interface HalfYearPeriod {
    id: string;          // 例: "2025-H2" (2025年度下半期)
    label: string;       // 例: "2025年度 下半期"
    startDate: string;   // 例: "2025-10-01"
    endDate: string;     // 例: "2026-03-31"
}

/** ポータルユーザー (トップページ用アカウント) */
export interface PortalUser {
    id: string;
    name: string;
    email?: string;
    role: 'admin' | 'manager' | 'user' | 'executive';
    password?: string;      // ポータルログイン用パスワード
    department?: string;    // 部門
    employeeId?: string;    // 社員ID
    allowedProjectIds?: string[]; // 閲覧許可プロジェクトID（部門外でも見せたいプロジェクト）
}

/** プロジェクトメタ情報 */
export interface ProjectMeta {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    isPinned: boolean;
    status: 'active' | 'completed' | 'archived';
    color: string;
    icon: string;

    // 対象年度・期
    fiscalYear?: number;            // 西暦 (例: 2025, 2026)
    halfPeriod?: 'H1' | 'H2';      // 上半期(H1) / 下半期(H2)

    // スプレッドシート連携
    sheetName?: string;         // スプレッドシート内のシートタブ名 (= プロジェクト名)
    projectPassword?: string;   // プロジェクト固有のログインPW (ポータルPWとは別)

    // プロジェクト評価 (Admin設定)
    projectScore?: number;      // プロジェクト最終評価スコア (0-10)
    evaluationPeriod?: string;  // 評価対象の半期ID

    // プロジェクト固有のメンバーリスト
    members: ProjectMember[];

    // プロジェクト固有の設定
    gasUrl?: string;
    cliqUrl?: string;
    spreadsheetId?: string;

    // 目標ファイルから生成された情報
    department?: string;        // 対象部署
    evaluatorTitle?: string;    // 評価者の役職
    goalEpics?: GoalEpic[];     // 目標エピック一覧 (最大5つ)
}

/** プロジェクトメンバー (プロジェクト単位のログイン) */
export interface ProjectMember {
    name: string;
    email: string;
    type: 'internal' | 'external';
    role: 'admin' | 'manager' | 'user' | 'executive';
}

/** 目標エピック（役割 + 重み + ルール + ゴール） */
export interface GoalEpic {
    id: string;
    name: string;            // 役割（エピック名）
    weight: number;          // 重み（配分 0-100%）
    dueDate: string;         // いつまで
    goal: string;            // どのような状態（ゴール）
    rule: string;            // ルール（皆が参照できる）
    status: 'active' | 'completed';  // エピックの状態
    score?: number;          // 評価者がつけた点数 (0-100)
    totalScore?: number;     // 部門長の総合評価 (0-10)
    scoredBy?: string;       // 評価者名
    scoredAt?: string;       // 評価日時
    memberScores?: GoalEpicMemberScore[];  // メンバー別スコア
}

/** エピック内のメンバー別スコア */
export interface GoalEpicMemberScore {
    memberName: string;      // メンバー名
    allocation: number;      // このメンバーのエピック内配分 (0-100%)
    score?: number;          // 個人スコア (0-100)
}

/** 個人別スコア (タスクレベル) */
export interface PersonalTaskScore {
    projectId: string;
    projectName: string;
    taskId: string;
    taskTitle: string;
    memberName: string;
    individualScore: number;   // 個人の点数 (1-5 → 20-100)
    taskDifficulty: number;    // タスク難易度
    taskOutcome: number;       // タスク成果 (1-5)
}

/** 個人別プロジェクトポイント (集計後) */
export interface PersonalProjectPoint {
    projectId: string;
    projectName: string;
    memberName: string;
    averageIndividualScore: number;   // 個人の平均点数 (0-100)
    projectScore: number;             // プロジェクト評価点 (0-100)
    finalPoint: number;               // 最終ポイント = 個人点 × (プロジェクト評価点/100)
    taskCount: number;                // 参加タスク数
}

/** ベンチマーク（全プロジェクト横断集計） */
export interface BenchmarkEntry {
    memberName: string;
    totalPoints: number;        // 全プロジェクトの最終ポイント合計
    projectBreakdown: PersonalProjectPoint[];
    rank: number;
    periodId: string;           // 半期ID
}

// =========================================================
// 定数
// =========================================================

/** プロジェクトカードの色パレット */
export const PROJECT_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6',
];

/** プロジェクトアイコンリスト */
export const PROJECT_ICONS = [
    '📦', '🎨', '📐', '🔧', '📊', '🚀', '💼', '🏗️', '📋', '⚡',
    '🎯', '🔬', '📝', '🛠️', '💡',
];

/** 現在の半期を取得 */
export function getCurrentHalfYear(): HalfYearPeriod {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12

    // 日本の会計年度: 4月始まり
    // 上半期: 4月~9月, 下半期: 10月~3月
    if (month >= 4 && month <= 9) {
        return {
            id: `${year}-H1`,
            label: `${year}年度 上半期`,
            startDate: `${year}-04-01`,
            endDate: `${year}-09-30`,
        };
    } else {
        // 1-3月の場合は前年度の下半期
        const fiscalYear = month >= 10 ? year : year - 1;
        return {
            id: `${fiscalYear}-H2`,
            label: `${fiscalYear}年度 下半期`,
            startDate: `${fiscalYear}-10-01`,
            endDate: `${fiscalYear + 1}-03-31`,
        };
    }
}

/** 半期リストを生成 (過去3年分) */
export function getHalfYearPeriods(): HalfYearPeriod[] {
    const periods: HalfYearPeriod[] = [];
    const current = getCurrentHalfYear();
    const currentYear = parseInt(current.id.split('-')[0]);

    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
        periods.push({
            id: `${y}-H1`,
            label: `${y}年度 上半期`,
            startDate: `${y}-04-01`,
            endDate: `${y}-09-30`,
        });
        periods.push({
            id: `${y}-H2`,
            label: `${y}年度 下半期`,
            startDate: `${y}-10-01`,
            endDate: `${y + 1}-03-31`,
        });
    }
    return periods;
}

/** プロジェクトの年度・期ラベルを生成 */
export function getProjectPeriodLabel(fiscalYear?: number, halfPeriod?: 'H1' | 'H2'): string {
    if (!fiscalYear) return '';
    const periodLabel = halfPeriod === 'H1' ? '上半期' : halfPeriod === 'H2' ? '下半期' : '';
    return `${fiscalYear}年度${periodLabel ? ' ' + periodLabel : ''}`;
}

/** 西暦の選択肢を生成 (現在±3年) */
export function getFiscalYearOptions(): number[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const years: number[] = [];
    for (let y = currentYear - 3; y <= currentYear + 2; y++) {
        years.push(y);
    }
    return years;
}
