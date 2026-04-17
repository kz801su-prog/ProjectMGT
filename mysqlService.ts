import { Task, TaskStatus, TaskPriority, Milestone, MemberInfo, TaskComment, Attachment, TaskEvaluation, ProjectConcept } from './types';
import { PROJECT_MEMBERS } from './constants';

export interface PortalUserFromSheet {
  employeeId: string;
  name: string;
  department: string;
  portalPassword: string;
  role: 'admin' | 'manager' | 'user';
  allowedProjectIds?: string[]; // 閲覧許可プロジェクトID（部門外でも見せたいプロジェクト）
}

const buildApiUrl = (apiUrl: string, params: Record<string, string>) => {
  // _t パラメータでブラウザキャッシュをバストする（Chrome/Edge のキャッシュ差異対策）
  const query = new URLSearchParams({ ...params, _t: Date.now().toString() }).toString();
  return `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}${query}`;
};

export const fetchTasksFromSheet = async (apiUrl?: string, sheetName?: string): Promise<{ tasks: Task[], projectConcept?: ProjectConcept, epics: string[] }> => {
  if (!apiUrl) throw new Error('API URL is not set');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const fetchUrl = buildApiUrl(apiUrl, { action: 'get_all', sheetName: sheetName || 'default' });
    const response = await fetch(fetchUrl, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const result = await response.json();
    clearTimeout(timeoutId);

    if (result.status === 'success') {
      const data = result.data || {};
      return {
        tasks: data.tasks || [],
        projectConcept: data.projectConcept || undefined,
        epics: data.epics || []
      };
    } else {
      throw new Error(result.message || '情報の取得に失敗しました。');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("fetchTasksFromSheet error:", error);
    throw error;
  }
};

export const saveSingleTaskToSheet = async (
  task: Task,
  apiUrl: string,
  notify?: { email: boolean, cliq: boolean },
  members?: MemberInfo[],
  cliqNewTaskTemplate?: string,
  cliqWebhookUrl?: string,
  sheetName?: string
): Promise<boolean> => {
  if (!apiUrl) throw new Error('API URL not set');

  const payload = {
    action: 'save_task',
    task: task,
    sheetName: sheetName || 'default'
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Some basic validation just in case response isn't pure JSON (e.g., PHP warnings)
    const textRes = await response.text();
    let result;
    try {
      result = JSON.parse(textRes);
    } catch {
      throw new Error("Invalid response from server: " + textRes.substring(0, 100));
    }
    
    if (result.status !== 'success') {
      throw new Error(result.message || '保存に失敗しました(APIエラー)');
    }
    return true;
  } catch (error: any) {
    console.error("Task save failed:", error);
    throw new Error(`ネットワークエラー: ${error.message || ''}`);
  }
};

export const saveProjectConceptToSheet = async (
  concept: ProjectConcept,
  apiUrl: string,
  sheetName?: string
): Promise<boolean> => {
  if (!apiUrl) throw new Error('API URL not set');

  const payload = {
    action: 'save_concept',
    projectConcept: concept,
    sheetName: sheetName || 'default'
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'コンセプト保存に失敗しました(APIエラー)');
    }
    return true;
  } catch (error: any) {
    console.error("Concept save failed:", error);
    throw new Error("コンセプト保存に失敗: " + (error.message || ''));
  }
};

export const saveEpicsToSheet = async (
  epics: string[],
  apiUrl: string,
  sheetName?: string
): Promise<boolean> => {
  if (!apiUrl) throw new Error('API URL not set');

  const payload = {
    action: 'save_epics',
    epics: epics,
    sheetName: sheetName || 'default'
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'エピック保存に失敗しました(APIエラー)');
    }
    return true;
  } catch (error: any) {
    console.error("Epics save failed:", error);
    throw new Error("エピック保存に失敗: " + (error.message || ''));
  }
};

export const syncAllTasksToSheet = async (
  tasks: Task[],
  apiUrl: string,
  notify?: { email: boolean, cliq: boolean },
  members?: MemberInfo[],
  cliqNewTaskTemplate?: string,
  cliqWebhookUrl?: string,
  projectConcept?: ProjectConcept,
  sheetName?: string
): Promise<boolean> => {
  if (!apiUrl) throw new Error('API URL not set');

  const payload = {
    action: 'sync_all',
    tasks: tasks,
    projectConcept: projectConcept,
    sheetName: sheetName || 'default'
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || '全同期に失敗しました(APIエラー)');
    }
    return true;
  } catch (error: any) {
    console.error("Sync failed:", error);
    throw new Error("全同期に失敗: " + (error.message || ''));
  }
};

export const fetchPortalUsers = async (apiUrl: string): Promise<PortalUserFromSheet[]> => {
  if (!apiUrl) return [];
  try {
    const fetchUrl = buildApiUrl(apiUrl, { action: 'get_portal_users' });
    const response = await fetch(fetchUrl, { cache: 'no-store' });
    if (!response.ok) return [];
    const result = await response.json();
    if (result.status === 'success') {
      return result.users || [];
    }
    return [];
  } catch (e) {
    console.error("Failed to fetch portal users:", e);
    return [];
  }
};

export const savePortalUsers = async (apiUrl: string, users: PortalUserFromSheet[]): Promise<boolean> => {
  if (!apiUrl) throw new Error('API URL not set');
  const payload = { action: 'save_portal_users', users: users };
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    return true;
  } catch (error: any) {
    console.error("Portal users save failed:", error);
    return false;
  }
};

/** portal_projects をSQLに全件保存（goalEpics含む完全データ）*/
export const savePortalProjectsToSql = async (
  apiUrl: string,
  projects: any[]
): Promise<boolean> => {
  if (!apiUrl) throw new Error('[設定エラー] API URLが未設定です');
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({ action: 'save_portal_projects', projects }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (networkErr: any) {
    // fetch自体が失敗（サーバー到達不能・CORS等）
    const msg = `[ネットワークエラー] サーバーに接続できません (${apiUrl}) — ${networkErr.message}`;
    console.error('savePortalProjectsToSql network error:', networkErr);
    throw new Error(msg);
  }
  if (!response.ok) {
    // レスポンスボディからサーバー側のエラーメッセージを取得して表示する
    let serverMsg = '';
    try {
      const bodyText = await response.text();
      const bodyJson = JSON.parse(bodyText);
      serverMsg = bodyJson.message || bodyText.slice(0, 200);
    } catch {
      // JSON解析失敗時はボディテキストをそのまま使う（ただし長すぎる場合は切る）
    }
    const msg = `[HTTPエラー] ${response.status}${serverMsg ? ' — ' + serverMsg : ''}`;
    console.error('savePortalProjectsToSql http error:', response.status, serverMsg);
    throw new Error(msg);
  }
  let result: any;
  try {
    result = await response.json();
  } catch (parseErr) {
    throw new Error('[レスポンスエラー] サーバーのレスポンスがJSON形式ではありません（PHP構文エラーの可能性）');
  }
  if (result.status !== 'success') {
    throw new Error(`[SQLエラー] ${result.message || 'portal_projects保存失敗'}`);
  }
  return true;
};

/** SQLからportal_projectsを取得（localStorage空の時の復元用）*/
export const loadPortalProjectsFromSql = async (
  apiUrl: string
): Promise<{ projects: any[]; updatedAt?: string } | null> => {
  if (!apiUrl) return null;
  try {
    const url = buildApiUrl(apiUrl, { action: 'get_portal_projects' });
    const response = await fetch(url, { cache: 'no-store' });
    const result = await response.json();
    if (result.status === 'success') {
      return { projects: result.projects || [], updatedAt: result.updatedAt };
    }
    return null;
  } catch (error: any) {
    console.error('loadPortalProjectsFromSql failed:', error);
    return null;
  }
};

/** SQLから社員マスター（team_members）を取得 */
export const fetchTeamMembersFromSql = async (apiUrl: string): Promise<any[]> => {
  if (!apiUrl) return [];
  try {
    const url = buildApiUrl(apiUrl, { action: 'get_team_members' });
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    const result = await response.json();
    if (result.status === 'success') return result.members || [];
    return [];
  } catch (e) {
    console.error('fetchTeamMembersFromSql failed:', e);
    return [];
  }
};

/** 社員マスター（team_members）をSQLに保存 */
export const saveTeamMembersToSql = async (apiUrl: string, members: any[]): Promise<boolean> => {
  if (!apiUrl) throw new Error('[設定エラー] API URLが未設定です');
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({ action: 'save_team_members', members }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (networkErr: any) {
    throw new Error(`[ネットワークエラー] サーバーに接続できません — ${networkErr.message}`);
  }
  if (!response.ok) {
    let serverMsg = '';
    try { serverMsg = (await response.json()).message || ''; } catch {}
    throw new Error(`[HTTPエラー] ${response.status}${serverMsg ? ' — ' + serverMsg : ''}`);
  }
  const result = await response.json();
  if (result.status !== 'success') {
    throw new Error(`[SQLエラー] ${result.message || 'team_members保存失敗'}`);
  }
  return true;
};

/** goal_epics テーブルに部署+役職単位で一括保存（洗い替え） */
export const saveGoalEpicsToSql = async (
  apiUrl: string,
  department: string,
  evaluatorTitle: string,
  fiscalYear: number,
  halfPeriod: string,
  epics: Array<{ id: string; name: string; dueDate: string; goal: string; rule: string; weight: number; status: string }>
): Promise<boolean> => {
  if (!apiUrl) throw new Error('API URL not set');
  const payload = {
    action: 'save_goal_epics',
    department,
    evaluatorTitle,
    fiscalYear,
    halfPeriod,
    epics,
  };
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await response.json();
    if (result.status !== 'success') throw new Error(result.message || 'goal_epics保存失敗');
    return true;
  } catch (error: any) {
    console.error('saveGoalEpicsToSql failed:', error);
    throw error;
  }
};

export const createProjectSheet = async (apiUrl: string, projectSheetName: string): Promise<boolean> => {
  if (!apiUrl) throw new Error('API URL not set');
  const payload = { action: 'create_project_sheet', projectSheetName: projectSheetName };
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    return true;
  } catch (error: any) {
    console.error("Project sheet creation failed:", error);
    return false;
  }
};
