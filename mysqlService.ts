import { Task, TaskStatus, TaskPriority, Milestone, MemberInfo, TaskComment, Attachment, TaskEvaluation, ProjectConcept } from './types';
import { PROJECT_MEMBERS } from './constants';

export interface PortalUserFromSheet {
  employeeId: string;
  name: string;
  department: string;
  portalPassword: string;
  role: 'admin' | 'manager' | 'user';
}

const buildApiUrl = (apiUrl: string, params: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  return `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}${query}`;
};

export const fetchTasksFromSheet = async (apiUrl?: string, sheetName?: string): Promise<{ tasks: Task[], projectConcept?: ProjectConcept, epics: string[] }> => {
  if (!apiUrl) throw new Error('API URL is not set');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const fetchUrl = buildApiUrl(apiUrl, { action: 'get_all', sheetName: sheetName || 'default' });
    const response = await fetch(fetchUrl, { signal: controller.signal });
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
    const response = await fetch(fetchUrl);
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
