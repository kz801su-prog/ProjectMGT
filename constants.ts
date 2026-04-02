
import { Task, TaskStatus, TaskPriority, User } from './types';

// =========================================================
// 共有設定（ここに実際のURLを貼り付けてからビルドしてください）
// =========================================================

// 1. Google Apps Script (GAS) または PHP API のウェブアプリURL
export const DEFAULT_GAS_URL = 'https://kz801xs.xsrv.jp/pjctmgt/apiSQL.php';

// 2. Zoho Cliq の Webhook URL (チャット通知用)
export const DEFAULT_CLIQ_URL = 'https://cliq.zoho.com/api/v2/channelsbyname/tnzcd/message?zapikey=1001.c4e498597d7ecb17a361dc28ca531e5a.08ffaf17c758fce2840d1bae11abb486';

// 3. スプレッドシートID
export const SPREADSHEET_ID = '1jojtagaZooWZaR4-cj0JvcKtJPow27xX5IyAbpVRsQs';

// 4. シートのGID (タスク一覧シート) - ユーザー指定のGIDに修正
export const SHEET_GID = '2043314835';

// 5. 認証用シートのGID (secretsシート)
export const SECRETS_SHEET_GID = '0';

// ========================================================
// メンバー設定 (メールアドレス登録)
// =========================================================

export interface MemberInfo {
  name: string;
  email: string;
  type: 'internal' | 'external';
  role: 'admin' | 'manager' | 'user';
}

export const ADMIN_USER_NAME = '矢追和彦'; // 管理者ユーザー名定義

export const MEMBERS: MemberInfo[] = [
  { name: '矢追和彦', email: 'yaoi@sincol-n.co.jp', type: 'internal', role: 'admin' }, // Admin
  { name: '池田翼', email: 'ikeda@sincol-n.co.jp', type: 'internal', role: 'user' },
  { name: '吉田晴雄', email: 'yoshida-haru@sincol-n.co.jp', type: 'internal', role: 'user' },
  { name: '菅原美里', email: 'misato-sugahara@sincol-n.co.jp', type: 'internal', role: 'user' },
  { name: '星野光世', email: 'hoshino@sincol-n.co.jp', type: 'internal', role: 'user' },
  { name: '後藤太郎', email: 'taro-goto@sincol-n.co.jp', type: 'internal', role: 'user' },
];

// エピックメンバー一覧
export const PROJECT_MEMBERS = MEMBERS.map(m => m.name);
// デフォルトのエピックリスト（入力補完用）
export const DEFAULT_PROJECTS = [
  '表紙持手',
  '内面文書データ',
  '写真撮影データ',
  '商品開発国内',
  '商品開発中国',
  '個別開発',
  'その他'
];

export const INITIAL_TASKS: Task[] = [
  {
    id: 'sample-1',
    date: new Date().toISOString().split('T')[0],
    department: 'IDC名古屋',
    project: 'Leather2027 ',
    responsiblePerson: '矢追和彦',
    team: [],
    title: 'スプレッドシート同期中...',
    goal: '全データが正常に表示される状態',
    dueDate: '',
    startDate: '',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.MEDIUM,
    progress: [],
    milestones: [],
    comments: [],
    attachments: [],
    lastViewedBy: []
  }
];
