
// =========================================================
// 目標ファイルパーサー
// Excel/CSVの目標ファイルを解析し、プロジェクト＋エピックを生成
// =========================================================

import * as XLSX from 'xlsx';
import { GoalEpic, ProjectMeta, PROJECT_COLORS, PROJECT_ICONS } from './portalTypes';

/** パース結果: 1つの部署+役職=1つのプロジェクト候補 */
export interface ParsedGoalProject {
    department: string;       // 部署名
    evaluatorTitle: string;   // 役職（評価者）
    epics: ParsedGoalEpic[];  // エピック一覧
}

/** パースされたエピック */
export interface ParsedGoalEpic {
    name: string;       // 役割（エピック名）
    dueDate: string;    // いつまで
    goal: string;       // どのような状態（ゴール）
    rule: string;       // ルール
    weight: number;     // 重み（配分 %）
}

/**
 * 目標ファイル（Excel）を解析する
 *
 * ファイル構造（2段ヘッダ対応）:
 *   行1: タイトル行（空か会社名など）
 *   行2: 大項目ヘッダ（部署 | 役職 | 役割 | 結果・責任 | ...）
 *   行3: 小項目ヘッダ（部署 | 役職 | 役割 | いつまで | どのような状態 | ルール | 重み(配分）| ...）← これを使用
 *   行4以降: データ行
 *
 * グルーピング: 部署(A列) + 役職(B列) が同一 → 1プロジェクト（囲い）
 */
export async function parseGoalFile(file: File): Promise<ParsedGoalProject[]> {
    console.log('[GoalParser] 開始:', file.name, file.size, 'bytes');
    const data = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(data, { type: 'array' });

    console.log('[GoalParser] シート一覧:', workbook.SheetNames);

    // 最初のシートを使用
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: '' });

    console.log('[GoalParser] 総行数:', jsonData.length);
    console.log('[GoalParser] 行1:', JSON.stringify((jsonData[0] as any[])?.slice(0, 8)));
    console.log('[GoalParser] 行2:', JSON.stringify((jsonData[1] as any[])?.slice(0, 8)));
    console.log('[GoalParser] 行3:', JSON.stringify((jsonData[2] as any[])?.slice(0, 8)));
    console.log('[GoalParser] 行4:', JSON.stringify((jsonData[3] as any[])?.slice(0, 8)));

    if (jsonData.length < 2) {
        throw new Error('ファイルにデータが含まれていません（最低2行必要です）');
    }

    // ヘッダ行を解析
    // 2段ヘッダ対応: 行2（index 1）と行3（index 2）を確認し、詳細列名が含まれる方を使用
    let headerRowIndex = 0;
    let dataStartIndex = 1;

    const row2 = (jsonData[1] as any[]) || [];
    const row3 = (jsonData[2] as any[]) || [];

    // 行3（index 2）に「いつまで」「どのような状態」「ルール」「重み」があればそれを使用
    const row3Joined = row3.map((v: any) => str(v)).join('');
    const row2Joined = row2.map((v: any) => str(v)).join('');

    console.log('[GoalParser] row2Joined:', row2Joined.slice(0, 60));
    console.log('[GoalParser] row3Joined:', row3Joined.slice(0, 60));

    if (row3Joined.includes('いつまで') || row3Joined.includes('ルール') || row3Joined.includes('重み')) {
        headerRowIndex = 2;
        dataStartIndex = 3;
    } else if (row2Joined.includes('いつまで') || row2Joined.includes('ルール') || row2Joined.includes('重み')) {
        headerRowIndex = 1;
        dataStartIndex = 2;
    } else {
        headerRowIndex = 0;
        dataStartIndex = 1;
    }

    console.log('[GoalParser] headerRowIndex:', headerRowIndex, ' dataStartIndex:', dataStartIndex);

    const headerRow = jsonData[headerRowIndex] as any[];
    const colMap = detectColumns(headerRow);

    console.log('[GoalParser] colMap:', JSON.stringify(colMap));

    if (colMap.department < 0 || colMap.role < 0) {
        throw new Error(`必須列が見つかりません。department=${colMap.department}, role=${colMap.role}\nヘッダ行(${headerRowIndex+1}行目): ${JSON.stringify(headerRow?.slice(0,8))}`);
    }

    // データ行を解析
    // キー: "部署|||役職" → 部署+役職が同じものを1プロジェクトに束ねる
    const projects = new Map<string, ParsedGoalProject>();

    let lastDept = '';
    let lastTitle = '';

    for (let i = dataStartIndex; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        if (!row || row.length === 0) continue;

        const rawDept = str(row[colMap.department]);
        const rawTitle = str(row[colMap.title]);
        const roleName = str(row[colMap.role]);

        // 同じヘッダ行が再度現れたらデータ区切りとして終了
        if (rawDept === '部署' && rawTitle === '役職' && roleName === '役割') break;

        // 結合セル対応: 部署・役職が空の場合は前行の値を引き継ぐ
        const dept = rawDept || lastDept;
        // 役職は複数行改行入りの場合（例: "イズライフ 部長\nプローン 部長"）→ 正規化
        const title = rawTitle ? normalizeTitle(rawTitle) : lastTitle;

        if (dept) lastDept = dept;
        if (title) lastTitle = title;

        if (!roleName) continue; // 役割が空の行はスキップ

        const dueDate = parseDueDate(str(row[colMap.dueDate]));
        const goal = str(row[colMap.goal]);
        const rule = str(row[colMap.rule]);
        const weight = parseWeight(row[colMap.weight]);

        // "部署|||役職" をキーにして1プロジェクトにグループ化
        const key = `${dept}|||${title}`;

        if (!projects.has(key)) {
            projects.set(key, {
                department: dept,
                evaluatorTitle: title,
                epics: [],
            });
        }

        const project = projects.get(key)!;

        // 最大5エピックまで
        if (project.epics.length < 5) {
            project.epics.push({
                name: roleName,
                dueDate,
                goal,
                rule,
                weight,
            });
        }
    }

    const result = Array.from(projects.values());
    console.log('[GoalParser] 完了: ', result.length, 'プロジェクト');
    result.forEach(p => console.log(`  [${p.department}] / [${p.evaluatorTitle}] → ${p.epics.length}エピック`));
    return result;
}

/**
 * パース結果をProjectMetaの配列に変換
 */
export function convertToProjects(
    parsed: ParsedGoalProject[],
    fiscalYear: number,
    halfPeriod: 'H1' | 'H2'
): ProjectMeta[] {
    return parsed.map((p, index) => {
        const goalEpics: GoalEpic[] = p.epics.map((epic, idx) => ({
            id: `epic-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            name: epic.name,
            weight: epic.weight,
            dueDate: epic.dueDate,
            goal: epic.goal,
            rule: epic.rule,
            status: 'active' as const,
        }));

        // 重みの合計が100%になるよう正規化
        const totalWeight = goalEpics.reduce((sum, e) => sum + e.weight, 0);
        if (totalWeight > 0 && totalWeight !== 100) {
            goalEpics.forEach(e => {
                e.weight = Math.round((e.weight / totalWeight) * 100);
            });
            // 端数調整
            const diff = 100 - goalEpics.reduce((sum, e) => sum + e.weight, 0);
            if (diff !== 0 && goalEpics.length > 0) {
                goalEpics[0].weight += diff;
            }
        }

        const colorIdx = index % PROJECT_COLORS.length;
        const iconIdx = index % PROJECT_ICONS.length;

        return {
            id: `proj-goal-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
            name: `${p.department} - ${p.evaluatorTitle}`,
            description: `${p.evaluatorTitle}の目標管理 - ${goalEpics.length}つのエピック`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isPinned: false,
            status: 'active' as const,
            color: PROJECT_COLORS[colorIdx],
            icon: PROJECT_ICONS[iconIdx],
            members: [],
            sheetName: `${p.department}_${p.evaluatorTitle}`.replace(/[\r\n\/\\*?\[\]]/g, '_').slice(0, 30),
            fiscalYear,
            halfPeriod,
            department: p.department,
            evaluatorTitle: p.evaluatorTitle,
            goalEpics,
        };
    });
}

// =========================================================
// ヘルパー関数
// =========================================================

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = () => reject(new Error('ファイルの読み取りに失敗しました'));
        reader.readAsArrayBuffer(file);
    });
}

interface ColumnMap {
    department: number;   // 部署
    title: number;        // 役職
    role: number;         // 役割
    dueDate: number;      // いつまで
    goal: number;         // どのような状態
    rule: number;         // ルール
    weight: number;       // 重み(配分)
}

/** ヘッダ行から列インデックスを自動検出 */
function detectColumns(header: any[]): ColumnMap {
    const map: ColumnMap = {
        department: -1,
        title: -1,
        role: -1,
        dueDate: -1,
        goal: -1,
        rule: -1,
        weight: -1,
    };

    for (let i = 0; i < header.length; i++) {
        const col = str(header[i]).replace(/\s+/g, '');
        if (!col) continue;

        if (col.includes('部署') || col.includes('部門')) {
            if (map.department < 0) map.department = i;
        } else if (col.includes('役職') || col.includes('職位') || col.includes('ポジション')) {
            if (map.title < 0) map.title = i;
        } else if (col.includes('役割') || col.includes('エピック')) {
            if (map.role < 0) map.role = i;
        } else if (col.includes('いつまで') || col.includes('期限') || col.includes('締切')) {
            if (map.dueDate < 0) map.dueDate = i;
        } else if (col.includes('どのような状態') || col.includes('状態') || col.includes('ゴール') || col.includes('目標')) {
            if (map.goal < 0) map.goal = i;
        } else if (col.includes('ルール') || col.includes('規則') || col.includes('基準')) {
            if (map.rule < 0) map.rule = i;
        } else if (col.includes('重み') || col.includes('配分') || col.includes('ウェイト') || col.toLowerCase().includes('weight')) {
            if (map.weight < 0) map.weight = i;
        }
    }

    // 検出できなかった列のフォールバック（位置ベース）
    // 列順: 部署(0) | 役職(1) | 役割(2) | いつまで(3) | どのような状態(4) | ルール(5) | 重み(6)
    if (map.department < 0) map.department = 0;
    if (map.title < 0) map.title = 1;
    if (map.role < 0) map.role = 2;
    if (map.dueDate < 0) map.dueDate = 3;
    if (map.goal < 0) map.goal = 4;
    if (map.rule < 0) map.rule = 5;
    if (map.weight < 0) map.weight = 6;

    return map;
}

function str(val: any): string {
    if (val === undefined || val === null) return '';
    return String(val).trim();
}

/** 役職の改行（複数役職）を "/" で連結して正規化 */
function normalizeTitle(title: string): string {
    return title
        .replace(/\r\n|\r|\n/g, ' / ')
        .replace(/\s*\/\s*/g, ' / ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 「期末まで」「2026/3/31」などの期限文字列を正規化 */
function parseDueDate(value: string): string {
    if (!value) return '';

    // 「期末まで」→ 期末日に変換
    if (value.includes('期末') || value.includes('年度末')) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = month >= 4 ? now.getFullYear() + 1 : now.getFullYear();
        return `${year}-03-31`;
    }

    // 「上半期末」
    if (value.includes('上半期末') || value.includes('上期末')) {
        const now = new Date();
        const year = now.getFullYear();
        return `${year}-09-30`;
    }

    // 「下半期末」
    if (value.includes('下半期末') || value.includes('下期末')) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = month >= 10 ? now.getFullYear() + 1 : now.getFullYear();
        return `${year}-03-31`;
    }

    // 日付形式の場合はそのまま
    const dateMatch = value.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (dateMatch) {
        return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    }

    return value;
}

/** 「60%」「0.6」「60」等のウェイト文字列をパーセント数値に変換 */
function parseWeight(value: any): number {
    if (value === undefined || value === null || value === '') return 0;
    const s = String(value).trim().replace(/[%％]/g, '');
    const num = parseFloat(s);
    if (isNaN(num)) return 0;
    // 0.6 → 60, 0.1 → 10 (0〜1の場合はパーセントに変換)
    if (num > 0 && num <= 1) return Math.round(num * 100);
    return Math.round(num);
}
