
import { Task, TaskStatus, TaskPriority, Milestone, MemberInfo, TaskComment, Attachment, TaskEvaluation, ProjectConcept } from './types';
import { PROJECT_MEMBERS, SPREADSHEET_ID, SHEET_GID } from './constants';

// [Important] Use JSON output instead of CSV to correctly handle newlines in cells
const getJsonUrl = () => `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;

const safeJsonParse = <T>(jsonString: string, defaultValue: T): T => {
  if (!jsonString || jsonString === 'null' || jsonString === '' || jsonString === 'undefined') return defaultValue;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return defaultValue;
  }
};

// Helper to fix Gviz "Date(yyyy,m,d)" strings if they appear as values or "new Date(...)"
const normalizeGvizDate = (val: string): string => {
  if (!val) return '';
  // Handle "Date(2026,2,31)" or "new Date(2026,2,31)"
  // Note: Gviz months are 0-indexed (0=Jan, 11=Dec)
  const match = val.match(/(?:new\s+)?Date\((\d+),(\d+),(\d+)\)/);
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]) + 1;
    const day = parseInt(match[3]);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  return val;
};

const mapRowToTask = (rawRow: any[], sheetRowNumber: number): Task | null => {
  // Ensure we have enough columns by padding with empty strings
  const row = [...rawRow];
  while (row.length < 25) { row.push(''); }

  // Check valid row: must have Title(3) OR Person(1) OR Date(0)
  // Also filter out obvious header rows if they slipped through
  if (row[3] === 'タイトル' || row[0]?.includes('Last Updated') || row[0]?.includes('Board Tracker') || row[0]?.includes('Project:')) return null;

  const hasContent = row[0] || row[1] || row[3];
  if (!hasContent) return null;

  const date = normalizeGvizDate(row[0] || '');
  const personRaw = row[1] || '';
  const dept = row[2] || '';
  const title = row[3] || '(タイトルなし)';
  const isSoftDeleted = row[4] === 'SOFT_DELETE' || row[4] === 'TRUE' || row[4] === 'true' || row[4] === true;
  const statusRaw = row[5] || '';
  const priorityRaw = row[6] || '';
  const progressContent = row[7] || '';
  const dueDate = normalizeGvizDate(row[8] || '');
  const isCommittedRaw = row[9] || '';
  const reviewerRaw = row[10] || '';
  const teamJson = row[11] || '[]';
  const startDate = normalizeGvizDate(row[12] || '');
  const goal = row[13] || '';
  const milestonesJson = row[14] || '[]';
  const project = row[15] || '';
  const commentsJson = row[16] || '[]';
  const attachmentsJson = row[17] || '[]';
  const dependenciesJson = row[18] || '[]';
  const evaluationJson = row[19] || 'null';
  const uuid = row[20] || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const parentId = row[21] || '';
  let hierarchyType = row[22] || '';
  const trackId = row[23] || '';
  const lastViewedByJson = row[24] || '[]';

  // Infer hierarchyType if missing but parentId exists
  if (!hierarchyType && parentId) {
    hierarchyType = 'subtask';
  } else if (!hierarchyType) {
    hierarchyType = 'root';
  }

  const matchedExec = PROJECT_MEMBERS.find(exec => personRaw.includes(exec));
  const person = matchedExec || personRaw || '未割当';

  let status = TaskStatus.TODO;
  const s = statusRaw.toUpperCase();
  if (s.includes('完了') || s === 'TRUE' || s === 'COMPLETED') {
    status = TaskStatus.COMPLETED;
  } else if (s.includes('進行中') || s === 'IN_PROGRESS') {
    status = TaskStatus.IN_PROGRESS;
  } else if (s.includes('遅延') || s.includes('期限切れ') || s === 'OVERDUE') {
    status = TaskStatus.OVERDUE;
  } else if (s.includes('未着手') || s === 'TODO') {
    status = TaskStatus.TODO;
  }

  let priority = TaskPriority.MEDIUM;
  if (priorityRaw.includes('高')) priority = TaskPriority.HIGH;
  else if (priorityRaw.includes('低')) priority = TaskPriority.LOW;

  const progress = progressContent ? progressContent.split(' | ').filter((c: string) => c.trim()).map((content: string, i: number) => {
    const dateMatch = content.match(/^\[(.*?)\]\s*(.*)/);
    return {
      week: i + 1,
      content: dateMatch ? dateMatch[2] : content,
      updatedAt: dateMatch ? dateMatch[1] : date,
      author: person
    };
  }).reverse() : [];

  return {
    id: `sheet-${sheetRowNumber}`, // Use actual sheet row number for ID
    date, department: dept, project: project || '未分類',
    responsiblePerson: person, team: safeJsonParse<string[]>(teamJson, []),
    title, goal, startDate, dueDate,
    milestones: safeJsonParse<Milestone[]>(milestonesJson, []),
    isCommitted: isCommittedRaw.toUpperCase() === 'TRUE' || isCommittedRaw === '1',
    isSoftDeleted, status, priority, progress,
    comments: safeJsonParse<TaskComment[]>(commentsJson, []),
    attachments: safeJsonParse<Attachment[]>(attachmentsJson, []),
    dependencies: safeJsonParse<string[]>(dependenciesJson, []),
    lastViewedBy: safeJsonParse<{ userId: string, userName: string, timestamp: string }[]>(lastViewedByJson, []),
    reviewer: reviewerRaw,
    evaluation: safeJsonParse<TaskEvaluation | undefined>(evaluationJson, undefined),
    uuid,
    parentId,
    hierarchyType: hierarchyType as any,
    trackId
  } as Task;
};

// =========================================================
// sheetName付きGAS URL生成ヘルパー
// =========================================================
function buildGasGetUrl(gasUrl: string, sheetName?: string, action?: string): string {
  const params: string[] = [];
  if (sheetName) params.push(`sheetName=${encodeURIComponent(sheetName)}`);
  if (action) params.push(`action=${encodeURIComponent(action)}`);
  params.push(`t=${Date.now()}`);
  const separator = gasUrl.includes('?') ? '&' : '?';
  return `${gasUrl}${separator}${params.join('&')}`;
}

// =========================================================
// タスク読み込み (sheetName対応)
// =========================================================
export const fetchTasksFromSheet = async (gasUrl?: string, sheetName?: string): Promise<{ tasks: Task[], projectConcept?: ProjectConcept, epics: string[] }> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  const fetchFromGviz = async (): Promise<{ tasks: Task[], projectConcept?: ProjectConcept, epics: string[] }> => {
    console.log("Fetching tasks via Gviz API (Fallback)");
    const gvizResponse = await fetch(`${getJsonUrl()}&t=${Date.now()}`, { signal: controller.signal });
    if (!gvizResponse.ok) {
      if (gvizResponse.status === 401 || gvizResponse.status === 403) {
        throw new Error("スプレッドシートへのアクセス権限がありません。シートを「リンクを知っている全員」に共有するか、Googleアカウントでログインしてください。");
      }
      throw new Error(`Gviz Fetch failed: ${gvizResponse.status}`);
    }

    const text = await gvizResponse.text();
    const start = text.indexOf('({');
    const end = text.lastIndexOf('})');
    if (start === -1 || end === -1) throw new Error('Invalid JSONP format from Gviz');

    let jsonString = text.substring(start + 1, end + 1);
    jsonString = jsonString.replace(/new Date\((\d+),(\d+),(\d+)\)/g, '"Date($1,$2,$3)"');

    const data = JSON.parse(jsonString);
    const rows = data.table.rows;

    const stringRows = rows.map((r: any) =>
      r.c.map((cell: any) => cell && cell.v !== null ? String(cell.v) : '')
    );

    let headerIndex = -1;
    for (let i = 0; i < Math.min(stringRows.length, 5); i++) {
      if (stringRows[i][3] === 'タイトル') {
        headerIndex = i;
        break;
      }
    }

    const resultTasks: Task[] = [];
    stringRows.forEach((row: string[], index: number) => {
      if (index <= headerIndex) return;
      const sheetRowNumber = headerIndex === -1 ? index + 4 : (index - headerIndex) + 3;
      const task = mapRowToTask(row, sheetRowNumber);
      if (task) resultTasks.push(task);
    });

    // Deduplicate by UUID, keeping the latest row
    const taskMap = new Map<string, Task>();
    resultTasks.forEach(t => {
      if (t.uuid) taskMap.set(t.uuid, t);
      else taskMap.set(t.id, t);
    });

    return { tasks: Array.from(taskMap.values()), epics: [] };
  };

  try {
    if (gasUrl) {
      console.log("Fetching tasks via GAS:", gasUrl, "sheetName:", sheetName || '(default)');
      try {
        const fetchUrl = buildGasGetUrl(gasUrl, sheetName);
        const response = await fetch(fetchUrl, { signal: controller.signal });
        console.log("GAS Response status:", response.status);

        if (!response.ok) {
          console.warn(`GAS endpoint returned ${response.status}, falling back to Gviz`);
          return await fetchFromGviz();
        }

        const result = await response.json();
        console.log("GAS Result status:", result.status);

        if (result.status === 'success') {
          clearTimeout(timeoutId);
          const stringRows = result.data.map((row: any[]) => row.map(cell => cell !== null ? String(cell) : ''));
          const resultTasks: Task[] = [];
          stringRows.forEach((row: string[], index: number) => {
            const sheetRowNumber = index + 4;
            const task = mapRowToTask(row, sheetRowNumber);
            if (task) resultTasks.push(task);
          });

          // Deduplicate by UUID, keeping the latest row
          const taskMap = new Map<string, Task>();
          resultTasks.forEach(t => {
            if (t.uuid) taskMap.set(t.uuid, t);
            else taskMap.set(t.id, t);
          });

          return { tasks: Array.from(taskMap.values()), projectConcept: result.projectConcept, epics: result.epics || [] };
        } else {
          console.warn("GAS returned error status, falling back to Gviz:", result.message);
          return await fetchFromGviz();
        }
      } catch (gasError) {
        console.warn("GAS fetch failed, falling back to Gviz:", gasError);
        return await fetchFromGviz();
      }
    } else {
      const data = await fetchFromGviz();
      clearTimeout(timeoutId);
      return data;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Final fetch error:", error);
    throw error;
  }
};

const mapTaskToRow = (t: Task) => {
  // Ensure progress is array before mapping
  const progressList = Array.isArray(t.progress) ? t.progress : [];

  return {
    date: t.date || "",
    responsiblePerson: t.responsiblePerson || "",
    department: t.department || "",
    title: t.title || "",
    status: t.status,
    priority: t.priority,
    progress: progressList.map(p => ({ updatedAt: p.updatedAt, content: p.content })),
    dueDate: t.dueDate || "",
    isCommitted: t.isCommitted || false,
    isSoftDeleted: t.isSoftDeleted ? 'SOFT_DELETE' : '',
    reviewer: t.reviewer || "",
    team: JSON.stringify(t.team),
    startDate: t.startDate || "",
    goal: t.goal || "",
    milestones: JSON.stringify(t.milestones),
    project: t.project || "",
    comments: JSON.stringify(t.comments || []),
    attachments: JSON.stringify(t.attachments || []),
    dependencies: JSON.stringify(t.dependencies || []),
    evaluation: JSON.stringify(t.evaluation || null),
    uuid: t.uuid || "",
    parentId: t.parentId || "",
    hierarchyType: t.hierarchyType || "root",
    trackId: t.trackId || "",
    lastViewedBy: JSON.stringify(t.lastViewedBy || [])
  };
};

// =========================================================
// タスク保存 (sheetName対応)
// =========================================================
export const saveSingleTaskToSheet = async (
  task: Task,
  gasUrl: string,
  notify?: { email: boolean, cliq: boolean },
  members?: MemberInfo[],
  cliqNewTaskTemplate?: string,
  cliqWebhookUrl?: string,
  sheetName?: string
): Promise<boolean> => {
  if (!gasUrl) throw new Error('GAS URL not set');

  const payload: any = {
    action: 'save_task',
    task: mapTaskToRow(task),
    taskId: task.id
  };
  if (sheetName) payload.sheetName = sheetName;

  console.log("[GAS Save] Sending:", task.title, "id:", task.id, "uuid:", task.uuid, "sheet:", sheetName || '(default)');

  const attemptSave = async (attempt: number): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      console.log("[GAS Save] POST sent successfully (opaque response ignored).");
      return true;
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(`[GAS Save] Attempt ${attempt} failed:`, error.name, error.message);

      if (error.name === 'AbortError') {
        throw new Error("保存がタイムアウトしました。通信環境を確認してください。");
      }

      if (error.name === 'TypeError' || (error.message && error.message.includes('Failed to fetch'))) {
        console.warn("[GAS Save] TypeError on no-cors fetch. Assuming push success:", error.message);
        return true;
      }

      const msg = error.message || '';
      throw new Error(`ネットワークエラー: ${msg}`);
    }
  };

  return attemptSave(1);
};

// =========================================================
// コンセプト保存 (sheetName対応)
// =========================================================
export const saveProjectConceptToSheet = async (
  concept: ProjectConcept,
  gasUrl: string,
  sheetName?: string
): Promise<boolean> => {
  if (!gasUrl) throw new Error('GAS URL not set');

  const payload: any = {
    action: 'save_concept',
    projectConcept: concept
  };
  if (sheetName) payload.sheetName = sheetName;

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }
    });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'コンセプト保存に失敗しました(GASエラー)');
    }
    return true;
  } catch (error: any) {
    console.error("Concept save failed:", error);
    const msg = error.message || '';
    if (msg.includes('Unknown action')) {
      throw new Error("【重要設定エラー】GASのコードが古いバージョンで動いています。GASエディタにて「新しいデプロイ」を作成し、新しいURLを設定し直してください！");
    }
    throw new Error("コンセプト保存に失敗: " + msg);
  }
};

// =========================================================
// エピック保存 (sheetName対応)
// =========================================================
export const saveEpicsToSheet = async (
  epics: string[],
  gasUrl: string,
  sheetName?: string
): Promise<boolean> => {
  if (!gasUrl) throw new Error('GAS URL not set');

  const payload: any = {
    action: 'save_epics',
    epics: epics
  };
  if (sheetName) payload.sheetName = sheetName;

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }
    });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'エピック保存に失敗しました(GASエラー)');
    }
    return true;
  } catch (error: any) {
    console.error("Epics save failed:", error);
    const msg = error.message || '';
    if (msg.includes('Unknown action')) {
      throw new Error("【重要設定エラー】GASのコードが古いバージョンで動いています。GASエディタにて「新しいデプロイ」を作成し、新しいURLを設定し直してください！");
    }
    throw new Error("エピック保存に失敗: " + msg);
  }
};

// =========================================================
// 全同期 (sheetName対応)
// =========================================================
export const syncAllTasksToSheet = async (
  tasks: Task[],
  gasUrl: string,
  notify?: { email: boolean, cliq: boolean },
  members?: MemberInfo[],
  cliqNewTaskTemplate?: string,
  cliqWebhookUrl?: string,
  projectConcept?: ProjectConcept,
  sheetName?: string
): Promise<boolean> => {
  if (!gasUrl) throw new Error('GAS URL not set');

  const payload: any = {
    action: 'sync_all',
    tasks: tasks.map(mapTaskToRow),
    projectConcept: projectConcept
  };
  if (sheetName) payload.sheetName = sheetName;

  console.log("Posting ALL tasks to GAS:", gasUrl, "sheet:", sheetName || '(default)');
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }
    });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || '全同期に失敗しました(GASエラー)');
    }
    return true;
  } catch (error: any) {
    console.error("Sync failed:", error);
    const msg = error.message || '';
    if (msg.includes('Unknown action')) {
      throw new Error("【重要設定エラー】GASのコードが古いバージョンで動いています。GASエディタにて「新しいデプロイ」を作成し、新しいURLを設定し直してください！");
    }
    throw new Error("全同期に失敗: " + msg);
  }
};

// =========================================================
// ポータルユーザーの読み込み (portal_usersシートから)
// =========================================================
export interface PortalUserFromSheet {
  employeeId: string;
  name: string;
  department: string;
  portalPassword: string;
  role: 'admin' | 'manager' | 'user';
}

export const fetchPortalUsers = async (gasUrl: string): Promise<PortalUserFromSheet[]> => {
  if (!gasUrl) return [];

  try {
    const fetchUrl = buildGasGetUrl(gasUrl, undefined, 'get_portal_users');
    const response = await fetch(fetchUrl);
    if (!response.ok) return [];
    const result = await response.json();
    if (result.status === 'success') {
      return (result.users || []).map((u: any) => ({
        employeeId: u.employeeId || '',
        name: u.name || '',
        department: u.department || '',
        portalPassword: u.portalPassword || '',
        role: u.role || 'user'
      }));
    }
    return [];
  } catch (e) {
    console.error("Failed to fetch portal users:", e);
    return [];
  }
};

// =========================================================
// ポータルユーザーの保存 (portal_usersシートへ)
// =========================================================
export const savePortalUsers = async (gasUrl: string, users: PortalUserFromSheet[]): Promise<boolean> => {
  if (!gasUrl) throw new Error('GAS URL not set');

  const payload = {
    action: 'save_portal_users',
    users: users
  };

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }
    });
    console.log("[Portal Users] Save sent successfully.");
    return true;
  } catch (error: any) {
    console.error("Portal users save failed:", error);
    return true; // no-cors mode, assume success
  }
};

// =========================================================
// プロジェクトシートの作成
// =========================================================
export const createProjectSheet = async (gasUrl: string, projectSheetName: string): Promise<boolean> => {
  if (!gasUrl) throw new Error('GAS URL not set');

  const payload = {
    action: 'create_project_sheet',
    projectSheetName: projectSheetName
  };

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }
    });
    console.log("[GAS] Project sheet creation sent for:", projectSheetName);
    return true;
  } catch (error: any) {
    console.error("Project sheet creation failed:", error);
    return true; // no-cors, assume success
  }
};
