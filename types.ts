
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE'
}

export enum TaskPriority {
  HIGH = '高',
  MEDIUM = '中',
  LOW = '低'
}

export interface ProgressUpdate {
  week: number;
  content: string;
  updatedAt: string;
  author: string;
}

export interface TaskComment {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  isCompleted: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: 'link' | 'file';
  addedBy: string;
  addedAt: string;
}

export interface MemberEvaluation {
  memberId: string; // メンバー名
  rating: 1 | 2 | 3 | 4 | 5; // 5段階評価
}

export interface TaskEvaluation {
  difficulty: number; // 難易度点数 (例: 50)
  outcome: 1 | 2 | 3 | 4 | 5; // 出来栄え (1=20%, 5=100%)
  memberEvaluations: MemberEvaluation[];
}

export interface ProjectConcept {
  name: string;
  content: string;
  attachments: Attachment[];
}

export interface Task {
  id: string;
  date: string; // 作成日
  department: string;

  // エピック・分類
  project: string; // エピック名 (New)

  // 担当・チーム
  responsiblePerson: string; // 責任者 (Owner)
  team: string[]; // タスクチームメンバー (Collaborators)
  reviewer?: string; // 確認者

  // 内容
  title: string;
  description?: string;
  goal?: string; // ゴールの状態・完了定義 (Definition of Done)

  // スケジュール
  startDate?: string; // 開始日
  dueDate: string; // 完了日
  milestones: Milestone[]; // 中間ゴール管理

  isCommitted?: boolean; // 絶対完了フラグ
  isSoftDeleted?: boolean; // 仮削除フラグ
  status: TaskStatus;
  priority: TaskPriority;
  progress: ProgressUpdate[];
  comments: TaskComment[];
  attachments: Attachment[]; // 添付ファイル(リンク)
  dependencies?: string[]; // 先行タスクのID一覧 (このタスクが依存しているタスク)
  lastViewedBy: {
    userId: string;
    userName: string;
    timestamp: string;
  }[];
  evaluation?: TaskEvaluation; // タスク評価
  uuid?: string; // ユニークID (重複保存防止用)

  // 階層構造 (Hierarchy)
  parentId?: string; // 親タスクのID
  hierarchyType?: 'root' | 'subtask' | 'sibling'; // 役割
  trackId?: string; // ガントチャートで同じラインに表示するためのグループID
}

export interface User {
  id: string;
  name: string;
  email?: string;
  department: string;
  role: 'admin' | 'board_member' | 'staff' | 'external';
}

export interface MemberInfo {
  name: string;
  email: string;
  type: 'internal' | 'external';
  role: 'admin' | 'manager' | 'user'; // Added distinction
}

export interface DashboardStats {
  total: number;
  rootCount: number; // 親と兄弟
  subCount: number;  // 子
  completed: number;
  pending: number;
  overdue: number;
  epics: number;
}
