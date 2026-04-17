
// =========================================================
// チームメンバーCSV/Excelパーサー
// =========================================================
// CSVフォーマット（ヘッダ1行目、データ2行目以降）:
//   社員ID, 名前, 部署, 役職, タイプ, メールアドレス, 半期ID, 半期獲得点数, プロジェクトID, プロジェクト名, プロジェクト点数
//
// 同じ社員ID（または名前）を持つ行は1人のメンバーとして統合されます。
// 半期ID/点数・プロジェクトID/点数は省略可能です。
// =========================================================

import * as XLSX from 'xlsx';
import { MemberInfo, PeriodPoint, MemberProjectScore } from './types';

/** パース結果 */
export interface MemberCSVParseResult {
    members: MemberInfo[];
    errors: string[];
    warnings: string[];
}

/** ヘッダー列名マッピング（日本語・英語どちらも対応） */
const COLUMN_ALIASES: Record<string, string[]> = {
    employeeId:   ['社員id', '社員ID', '社員番号', 'id', 'ID', 'employeeid', 'employee_id'],
    name:         ['名前', '氏名', 'name', '担当者名', '社員名'],
    businessUnit: ['部門グループ', '部門グループ（階層含む）', '部門グループ(階層含む)', '事業部', 'businessunit', 'business_unit', 'division'],
    department:   ['部署', '部署名', 'department', 'dept'],
    position:     ['役職', '役職名', 'position', 'title', 'job_title'],
    role:         ['ロール', 'role', 'system_role'],
    type:         ['タイプ', '種別', 'type'],
    email:        ['メール', 'メールアドレス', 'email', 'mail'],
    periodId:     ['半期id', '半期ID', '期id', '期ID', 'period_id', 'periodid'],
    periodPoints: ['半期獲得点数', '半期点数', '獲得点数', 'period_points', 'periodpoints', '点数'],
    projectId:    ['プロジェクトid', 'プロジェクトID', 'project_id', 'projectid'],
    projectName:  ['プロジェクト名', 'project_name', 'projectname', 'project'],
    projectScore: ['プロジェクト点数', 'プロジェクトスコア', 'project_score', 'projectscore', '評価点数'],
};

/** 列名を正規化してキーを返す */
function detectColumn(header: string): string | null {
    const normalized = header.trim().toLowerCase();
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.some(a => a.toLowerCase() === normalized)) {
            return key;
        }
    }
    return null;
}

/** ロール名を正規化 */
function normalizeRole(val: string): MemberInfo['role'] {
    const v = val.trim().toLowerCase();
    if (v === 'admin' || v === '管理者') return 'admin';
    if (v === 'manager' || v === 'マネージャー' || v === '部長' || v === 'リーダー') return 'manager';
    if (v === 'executive' || v === '役員' || v === '経営') return 'executive';
    return 'user';
}

/** 役職テキスト（一般・課長A・部長・社長 等）からシステムロールを推定 */
function normalizeRoleFromPosition(position: string): MemberInfo['role'] {
    const v = position.trim();
    if (/社長|会長|専務|常務|取締役|監査役/.test(v)) return 'executive';
    if (/部長|課長|所長|マネージャー|主任|リーダー|代行|次長/.test(v)) return 'manager';
    if (/管理者|admin/i.test(v)) return 'admin';
    return 'user';
}

/** タイプ名を正規化 */
function normalizeType(val: string): MemberInfo['type'] {
    const v = val.trim().toLowerCase();
    if (v === 'external' || v === '外部' || v === '外注') return 'external';
    return 'internal';
}

/**
 * メンバーCSV/Excelファイルをパースする
 */
export async function parseMemberFile(file: File): Promise<MemberCSVParseResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    let rows: any[][];
    try {
        const data = await readFileAsArrayBuffer(file);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    } catch (e: any) {
        errors.push(`ファイルの読み込みに失敗しました: ${e.message}`);
        return { members: [], errors, warnings };
    }

    if (rows.length < 2) {
        errors.push('ファイルにデータが含まれていません（ヘッダー行 + データ行が必要です）');
        return { members: [], errors, warnings };
    }

    // ヘッダ行を検出（最初の非空行）
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const row = rows[i] as any[];
        if (row.some(cell => cell !== '' && cell !== null && cell !== undefined)) {
            // ヘッダーキーワードが含まれているか確認
            const hasKeyword = row.some(cell => {
                const key = detectColumn(String(cell));
                return key === 'name' || key === 'employeeId';
            });
            if (hasKeyword) {
                headerRowIdx = i;
                break;
            }
        }
    }

    const headerRow = rows[headerRowIdx] as any[];

    // 列インデックスマップを構築
    const colMap: Record<string, number> = {};
    headerRow.forEach((cell, idx) => {
        const key = detectColumn(String(cell));
        if (key && !(key in colMap)) {
            colMap[key] = idx;
        }
    });

    if (!('name' in colMap)) {
        errors.push('「名前」列が見つかりません。ヘッダー行に「名前」または「氏名」列が必要です。');
        return { members: [], errors, warnings };
    }

    // データ行を処理（メンバーIDまたは名前でグループ化）
    const memberMap: Map<string, MemberInfo> = new Map();

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i] as any[];
        const isEmpty = row.every(cell => cell === '' || cell === null || cell === undefined);
        if (isEmpty) continue;

        const get = (key: string): string => {
            const idx = colMap[key];
            return idx !== undefined ? String(row[idx] ?? '').trim() : '';
        };

        const name = get('name');
        if (!name) {
            warnings.push(`行 ${i + 1}: 名前が空のためスキップしました`);
            continue;
        }

        const employeeId = get('employeeId') || `member-${name}`;
        const mapKey = get('employeeId') ? get('employeeId') : name;

        // 既存メンバーを取得または新規作成
        if (!memberMap.has(mapKey)) {
            // 役職フリーテキスト（position）と、システムロール（role）を分離
            // CSVの「役職」列は position に格納し、role は position から推定
            const positionText = get('position');
            const roleText = get('role');
            const resolvedRole = roleText
                ? normalizeRole(roleText)
                : positionText ? normalizeRoleFromPosition(positionText) : 'user';

            memberMap.set(mapKey, {
                name,
                email: get('email'),
                type: get('type') ? normalizeType(get('type')) : 'internal',
                role: resolvedRole,
                employeeId: get('employeeId') || undefined,
                businessUnit: get('businessUnit') || undefined,
                department: get('department') || undefined,
                position: positionText || undefined,
                periodPoints: [],
                projectScores: [],
            });
        }

        const member = memberMap.get(mapKey)!;

        // 半期ポイントを追加
        const periodId = get('periodId');
        const periodPointsStr = get('periodPoints');
        if (periodId && periodPointsStr) {
            const points = parseFloat(periodPointsStr);
            if (!isNaN(points)) {
                const existing = member.periodPoints!.find(p => p.periodId === periodId);
                if (!existing) {
                    member.periodPoints!.push({
                        periodId,
                        periodLabel: formatPeriodLabel(periodId),
                        points,
                    });
                }
            }
        }

        // プロジェクトスコアを追加
        const projectId = get('projectId');
        const projectName = get('projectName');
        const projectScoreStr = get('projectScore');
        if ((projectId || projectName) && projectScoreStr) {
            const score = parseFloat(projectScoreStr);
            if (!isNaN(score)) {
                const key = projectId || projectName;
                const existing = member.projectScores!.find(
                    ps => (ps.projectId || ps.projectName) === key
                );
                if (!existing) {
                    member.projectScores!.push({
                        projectId: projectId || '',
                        projectName: projectName || projectId,
                        periodId: periodId || undefined,
                        score,
                    });
                }
            }
        }
    }

    const members = Array.from(memberMap.values());

    if (members.length === 0) {
        errors.push('有効なメンバーデータが見つかりませんでした');
    }

    return { members, errors, warnings };
}

/** 半期IDからラベルを生成 (例: "2025-H1" → "2025年度 上半期") */
function formatPeriodLabel(periodId: string): string {
    const match = periodId.match(/^(\d{4})-(H[12])$/);
    if (!match) return periodId;
    const year = match[1];
    const half = match[2] === 'H1' ? '上半期' : '下半期';
    return `${year}年度 ${half}`;
}

/** ファイルをArrayBufferとして読み込む */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target!.result as ArrayBuffer);
        reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * メンバーリストをCSV文字列にエクスポートする
 */
export function exportMembersToCSV(members: MemberInfo[]): string {
    const rows: string[][] = [];

    // ヘッダー
    rows.push(['社員ID', '氏名', '部署', '部門グループ（階層含む）', '役職', 'ロール', 'タイプ', 'メールアドレス', '半期ID', '半期獲得点数', 'プロジェクトID', 'プロジェクト名', 'プロジェクト点数']);

    for (const m of members) {
        const baseRow = [
            m.employeeId || '',
            m.name,
            m.department || '',
            m.businessUnit || '',
            m.position || '',
            m.role,
            m.type,
            m.email,
        ];

        const periods = m.periodPoints || [];
        const projects = m.projectScores || [];

        if (periods.length === 0 && projects.length === 0) {
            // 実績なし
            rows.push([...baseRow, '', '', '', '', '']);
        } else {
            // 半期データ行
            for (const p of periods) {
                rows.push([...baseRow, p.periodId, String(p.points), '', '', '']);
            }
            // プロジェクトスコア行
            for (const ps of projects) {
                rows.push([...baseRow, ps.periodId || '', '', ps.projectId || '', ps.projectName, String(ps.score)]);
            }
            if (periods.length === 0 && projects.length > 0) {
                // プロジェクトだけある場合は最初の行のみ基本情報を出力済み
            }
        }
    }

    // BOM付きUTF-8 (Excel対応)
    const csvContent = rows.map(row =>
        row.map(cell => {
            const escaped = cell.replace(/"/g, '""');
            return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
                ? `"${escaped}"` : escaped;
        }).join(',')
    ).join('\r\n');

    return '\uFEFF' + csvContent;
}

/**
 * サンプルCSVテンプレートを生成する
 */
export function generateMemberCSVTemplate(): string {
    const rows: string[][] = [
        ['社員ID', '氏名', '部署', '部門グループ（階層含む）', '役職', 'ロール', 'タイプ', 'メールアドレス', '半期ID', '半期獲得点数', 'プロジェクトID', 'プロジェクト名', 'プロジェクト点数'],
        ['2001', '山田太郎', '営業部', '営業本部', '一般', 'user', 'internal', 'yamada@example.com', '2025-H1', '85', 'proj-1', 'プロジェクトA', '90'],
        ['2002', '田中花子', '管理本部', '管理本部', '課長A', 'manager', 'internal', 'tanaka@example.com', '', '', '', '', ''],
        ['2003', '佐藤次郎', '営業本部', 'OEM営業課', '部長', 'manager', 'internal', 'sato@example.com', '2025-H1', '92', '', '', ''],
    ];

    const csv = rows.map(row => row.join(',')).join('\r\n');
    return '\uFEFF' + csv;
}
