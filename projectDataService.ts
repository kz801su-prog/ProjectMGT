
// =========================================================
// プロジェクト別データ管理サービス
// localStorageベースでプロジェクトごとにデータを分離
// =========================================================

import { ProjectMeta, PortalUser, PersonalProjectPoint, BenchmarkEntry, getCurrentHalfYear } from './portalTypes';
import { Task, MemberInfo, ProjectConcept } from './types';

const PORTAL_PREFIX = 'portal_';
const PROJECT_PREFIX = 'project_';

// =========================================================
// ポータルレベルのデータ
// =========================================================

/** ポータルユーザー一覧を取得 */
export function getPortalUsers(): PortalUser[] {
    const saved = localStorage.getItem(`${PORTAL_PREFIX}users`);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch { }
    }
    return [];
}

/** ポータルユーザーを保存 */
export function savePortalUsers(users: PortalUser[]): void {
    localStorage.setItem(`${PORTAL_PREFIX}users`, JSON.stringify(users));
}

/** プロジェクト一覧を取得 */
export function getProjects(): ProjectMeta[] {
    const saved = localStorage.getItem(`${PORTAL_PREFIX}projects`);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch { }
    }
    return [];
}

/** プロジェクト一覧を保存 */
export function saveProjects(projects: ProjectMeta[]): void {
    localStorage.setItem(`${PORTAL_PREFIX}projects`, JSON.stringify(projects));
}

/** プロジェクトを追加 */
export function addProject(project: ProjectMeta): ProjectMeta[] {
    const projects = getProjects();
    projects.push(project);
    saveProjects(projects);
    return projects;
}

/** プロジェクトを更新 */
export function updateProject(updatedProject: ProjectMeta): ProjectMeta[] {
    const projects = getProjects().map(p =>
        p.id === updatedProject.id ? updatedProject : p
    );
    saveProjects(projects);
    return projects;
}

/** プロジェクトを削除 */
export function deleteProject(projectId: string): ProjectMeta[] {
    const projects = getProjects().filter(p => p.id !== projectId);
    saveProjects(projects);
    // プロジェクト固有のデータも削除
    clearProjectData(projectId);
    return projects;
}

// =========================================================
// ソート: ピン止め→新しい順→古い順
// =========================================================

export function sortProjects(projects: ProjectMeta[]): ProjectMeta[] {
    return [...projects].sort((a, b) => {
        // ピン止め優先
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        // 同じピン止め状態なら新しい順
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

// =========================================================
// プロジェクト固有のデータ (タスク、メンバー、コンセプト等)
// =========================================================

function projectKey(projectId: string, key: string): string {
    return `${PROJECT_PREFIX}${projectId}_${key}`;
}

/** プロジェクト固有のタスクを保存 */
export function saveProjectTasks(projectId: string, tasks: Task[]): void {
    localStorage.setItem(projectKey(projectId, 'tasks'), JSON.stringify(tasks));
}

/** プロジェクト固有のタスクを取得 */
export function getProjectTasks(projectId: string): Task[] {
    const saved = localStorage.getItem(projectKey(projectId, 'tasks'));
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch { }
    }
    return [];
}

/** プロジェクト固有のメンバーを保存 */
export function saveProjectMembers(projectId: string, members: MemberInfo[]): void {
    localStorage.setItem(projectKey(projectId, 'members'), JSON.stringify(members));
}

/** プロジェクト固有のメンバーを取得 */
export function getProjectMembers(projectId: string): MemberInfo[] {
    const saved = localStorage.getItem(projectKey(projectId, 'members'));
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch { }
    }
    return [];
}

/** プロジェクト固有のコンセプトを保存 */
export function saveProjectConcept(projectId: string, concept: ProjectConcept): void {
    localStorage.setItem(projectKey(projectId, 'concept'), JSON.stringify(concept));
}

/** プロジェクト固有のコンセプトを取得 */
export function getProjectConceptData(projectId: string): ProjectConcept | null {
    const saved = localStorage.getItem(projectKey(projectId, 'concept'));
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch { }
    }
    return null;
}

/** プロジェクト固有のエピックリストを保存 */
export function saveProjectEpics(projectId: string, epics: string[]): void {
    localStorage.setItem(projectKey(projectId, 'epics'), JSON.stringify(epics));
}

/** プロジェクト固有のエピックリストを取得 */
export function getProjectEpics(projectId: string): string[] {
    const saved = localStorage.getItem(projectKey(projectId, 'epics'));
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch { }
    }
    return [];
}

/** プロジェクト固有のGAS URLを保存 */
export function saveProjectGasUrl(projectId: string, url: string): void {
    localStorage.setItem(projectKey(projectId, 'gas_url'), url);
}

/** プロジェクト固有のGAS URLを取得 */
export function getProjectGasUrl(projectId: string): string {
    return localStorage.getItem(projectKey(projectId, 'gas_url')) || '';
}

/** プロジェクト固有のCliq URLを保存 */
export function saveProjectCliqUrl(projectId: string, url: string): void {
    localStorage.setItem(projectKey(projectId, 'cliq_url'), url);
}

/** プロジェクト固有のCliq URLを取得 */
export function getProjectCliqUrl(projectId: string): string {
    return localStorage.getItem(projectKey(projectId, 'cliq_url')) || '';
}

/** プロジェクト固有パスワードを保存 */
export function saveProjectPassword(projectId: string, password: string): void {
    localStorage.setItem(projectKey(projectId, 'password'), password);
}

/** プロジェクト固有パスワードを取得 */
export function getProjectPassword(projectId: string): string {
    return localStorage.getItem(projectKey(projectId, 'password')) || '';
}

/** プロジェクト固有データをすべて削除 */
export function clearProjectData(projectId: string): void {
    const prefix = `${PROJECT_PREFIX}${projectId}_`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

// =========================================================
// バックアップ
// =========================================================

/** 全プロジェクトデータのバックアップを作成 */
export function createFullBackup(): string {
    const backup: Record<string, any> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(PORTAL_PREFIX) || key.startsWith(PROJECT_PREFIX))) {
            try {
                backup[key] = JSON.parse(localStorage.getItem(key) || '');
            } catch {
                backup[key] = localStorage.getItem(key);
            }
        }
    }
    return JSON.stringify(backup, null, 2);
}

/** バックアップからリストア */
export function restoreFromBackup(backupJson: string): void {
    const backup = JSON.parse(backupJson);
    Object.entries(backup).forEach(([key, value]) => {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
}

// =========================================================
// ポイント計算 & ベンチマーク
// =========================================================

/**
 * 個人の最終ポイントを計算
 * 個人点数(0-100) × プロジェクト評価(0-100) / 100 = 最終ポイント
 * 例: 個人60点 × プロジェクト80点 / 100 = 48ポイント
 */
export function calculateFinalPoint(individualScore: number, projectScore: number): number {
    return Math.round((individualScore * projectScore) / 100);
}

/** 各プロジェクトの個人ポイントを計算 */
export function calculateProjectPoints(projects: ProjectMeta[]): PersonalProjectPoint[] {
    const results: PersonalProjectPoint[] = [];

    for (const project of projects) {
        const tasks = getProjectTasks(project.id);
        const completedTasks = tasks.filter(t => !t.isSoftDeleted && t.evaluation);

        // メンバーごとに集計
        const memberScores: Record<string, { total: number; count: number }> = {};

        for (const task of completedTasks) {
            if (!task.evaluation) continue;

            for (const memberEval of task.evaluation.memberEvaluations) {
                if (!memberScores[memberEval.memberId]) {
                    memberScores[memberEval.memberId] = { total: 0, count: 0 };
                }
                // 5段階評価を100点満点に変換 (1=20, 2=40, 3=60, 4=80, 5=100)
                const score100 = memberEval.rating * 20;
                memberScores[memberEval.memberId].total += score100;
                memberScores[memberEval.memberId].count += 1;
            }
        }

        const projectScore = project.projectScore || 0;

        for (const [memberName, scores] of Object.entries(memberScores)) {
            const avgScore = scores.count > 0 ? Math.round(scores.total / scores.count) : 0;
            results.push({
                projectId: project.id,
                projectName: project.name,
                memberName,
                averageIndividualScore: avgScore,
                projectScore,
                finalPoint: calculateFinalPoint(avgScore, projectScore),
                taskCount: scores.count,
            });
        }
    }

    return results;
}

/** ベンチマーク（全プロジェクト横断ランキング）を計算 */
export function calculateBenchmark(projects: ProjectMeta[], periodId?: string): BenchmarkEntry[] {
    const targetPeriod = periodId || getCurrentHalfYear().id;
    const filteredProjects = projects.filter(p =>
        !p.evaluationPeriod || p.evaluationPeriod === targetPeriod
    );

    const allPoints = calculateProjectPoints(filteredProjects);

    // メンバーごとに集計
    const memberTotals: Record<string, PersonalProjectPoint[]> = {};
    for (const point of allPoints) {
        if (!memberTotals[point.memberName]) {
            memberTotals[point.memberName] = [];
        }
        memberTotals[point.memberName].push(point);
    }

    // ランキング作成
    const entries: BenchmarkEntry[] = Object.entries(memberTotals).map(([name, breakdown]) => ({
        memberName: name,
        totalPoints: breakdown.reduce((sum, p) => sum + p.finalPoint, 0),
        projectBreakdown: breakdown,
        rank: 0,
        periodId: targetPeriod,
    }));

    // ソートしてランク付け
    entries.sort((a, b) => b.totalPoints - a.totalPoints);
    entries.forEach((entry, idx) => {
        entry.rank = idx + 1;
    });

    return entries;
}
