<?php
// Xserverで動作させるためのバックエンドAPI

header('Access-Control-Allow-Origin: *'); // 本番環境ではフロントエンドのドメインを指定してください
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// ==========================================
// データベース接続情報 (Xserver環境に合わせて変更)
// ==========================================
$db_host = 'localhost';
$db_name = 'kz801xs_pjct';
$db_user = 'kz801xs_692';
$db_pass = 'W|x7<J!BGGpG';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'DB Connection Failed: ' . $e->getMessage()]);
    exit;
}

// ==========================================
// ヘルパー関数
// ==========================================
function safe_json_decode($json_str, $default_array = true) {
    if (empty($json_str) || $json_str === 'null') return $default_array ? [] : null;
    $res = json_decode($json_str, true);
    return is_array($res) ? $res : ($default_array ? [] : null);
}

// ==========================================
// リクエスト処理
// ==========================================
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'get_all';
    $sheet_name = $_GET['sheetName'] ?? 'default';

    // ゴールエピック一覧取得（部署+年度でフィルタ可能）
    if ($action === 'get_goal_epics') {
        $dept       = $_GET['department'] ?? '';
        $fiscal     = $_GET['fiscalYear'] ?? '';
        $half       = $_GET['halfPeriod'] ?? '';

        $where = '1=1';
        $params = [];
        if ($dept)   { $where .= ' AND department = :dept';     $params[':dept']   = $dept; }
        if ($fiscal) { $where .= ' AND fiscal_year = :fiscal';  $params[':fiscal'] = (int)$fiscal; }
        if ($half)   { $where .= ' AND half_period = :half';    $params[':half']   = $half; }

        $stmt = $pdo->prepare("SELECT * FROM goal_epics WHERE $where ORDER BY department, evaluator_title, id");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $epics = [];
        foreach ($rows as $r) {
            $epics[] = [
                'id'             => $r['id'],
                'department'     => $r['department'],
                'evaluatorTitle' => $r['evaluator_title'],
                'epicName'       => $r['epic_name'],
                'dueDate'        => $r['due_date'],
                'goal'           => $r['goal'],
                'rule'           => $r['rule'],
                'weight'         => (float)$r['weight'],
                'fiscalYear'     => (int)$r['fiscal_year'],
                'halfPeriod'     => $r['half_period'],
                'status'         => $r['status'],
                'score'          => $r['score'] !== null ? (float)$r['score'] : null,
            ];
        }
        echo json_encode(['status' => 'success', 'epics' => $epics]);
        exit;
    }

    if ($action === 'get_portal_users') {
        $stmt = $pdo->prepare("SELECT * FROM portal_users");
        $stmt->execute();
        $users = [];
        while ($row = $stmt->fetch()) {
            $users[] = [
                'employeeId' => $row['employee_id'],
                'name' => $row['name'],
                'department' => $row['department'],
                'portalPassword' => $row['portal_password'],
                'role' => $row['role'],
            ];
        }
        echo json_encode(['status' => 'success', 'users' => $users]);
        exit;
    }

    // デフォルト: get_all (タスク、コンセプト、エピックを取得)
    try {
        // タスク取得
        $stmt = $pdo->prepare("SELECT * FROM tasks WHERE sheet_name = :sheet_name");
        $stmt->execute([':sheet_name' => $sheet_name]);
        $db_tasks = $stmt->fetchAll();

        $tasks = [];
        foreach ($db_tasks as $row) {
            $tasks[] = [
                'id' => $row['id'],
                'uuid' => $row['uuid'],
                'date' => $row['date'],
                'department' => $row['department'],
                'project' => $row['project'],
                'responsiblePerson' => $row['responsible_person'],
                'team' => safe_json_decode($row['team']),
                'title' => $row['title'],
                'goal' => $row['goal'],
                'startDate' => $row['start_date'],
                'dueDate' => $row['due_date'],
                'milestones' => safe_json_decode($row['milestones']),
                'isCommitted' => (bool)$row['is_committed'],
                'isSoftDeleted' => (bool)$row['is_soft_deleted'],
                'status' => $row['status'],
                'priority' => $row['priority'],
                'progress' => safe_json_decode($row['progress']),
                'comments' => safe_json_decode($row['comments']),
                'attachments' => safe_json_decode($row['attachments']),
                'dependencies' => safe_json_decode($row['dependencies']),
                'lastViewedBy' => safe_json_decode($row['last_viewed_by']),
                'reviewer' => $row['reviewer'],
                'evaluation' => safe_json_decode($row['evaluation'], false),
                'parentId' => $row['parent_id'],
                'hierarchyType' => $row['hierarchy_type'],
                'trackId' => $row['track_id'],
            ];
        }

        // プロジェクトコンセプト取得
        $stmt_pc = $pdo->prepare("SELECT * FROM project_concepts WHERE sheet_name = :sheet_name LIMIT 1");
        $stmt_pc->execute([':sheet_name' => $sheet_name]);
        $pc_row = $stmt_pc->fetch();
        $projectConcept = null;
        if ($pc_row) {
            $projectConcept = [
                'name' => $pc_row['name'],
                'content' => $pc_row['content'],
                'attachments' => safe_json_decode($pc_row['attachments'])
            ];
        }

        // エピック取得
        $stmt_ep = $pdo->prepare("SELECT name FROM epics WHERE sheet_name = :sheet_name");
        $stmt_ep->execute([':sheet_name' => $sheet_name]);
        $epics = [];
        while ($ep_row = $stmt_ep->fetch()) {
            $epics[] = $ep_row['name'];
        }

        echo json_encode([
            'status' => 'success',
            'data' => [
                'tasks' => $tasks,
                'projectConcept' => $projectConcept,
                'epics' => $epics
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

if ($method === 'POST') {
    $input_content = file_get_contents('php://input');
    $data = json_decode($input_content, true);
    
    if (!is_array($data)) {
        // payload形式ではない場合、一部のURL encodedも考慮
        $data = $_POST;
    }

    $action = $data['action'] ?? '';
    $sheet_name = $data['sheetName'] ?? 'default';

    try {
        if ($action === 'save_task') {
            $t = $data['task'] ?? [];
            if (empty($t) || empty($t['id'])) {
                echo json_encode(['status' => 'error', 'message' => 'Invalid task data']);
                exit;
            }
            
            // UPSERT()処理 - MySQLの ON DUPLICATE KEY UPDATEを使用
            $sql = "INSERT INTO tasks (
                        id, uuid, sheet_name, date, department, project, responsible_person, team, title, goal, start_date, due_date,
                        milestones, is_committed, is_soft_deleted, status, priority, progress, comments, attachments, dependencies,
                        last_viewed_by, reviewer, evaluation, parent_id, hierarchy_type, track_id
                    ) VALUES (
                        :id, :uuid, :sheet_name, :date, :department, :project, :responsible_person, :team, :title, :goal, :start_date, :due_date,
                        :milestones, :is_committed, :is_soft_deleted, :status, :priority, :progress, :comments, :attachments, :dependencies,
                        :last_viewed_by, :reviewer, :evaluation, :parent_id, :hierarchy_type, :track_id
                    ) ON DUPLICATE KEY UPDATE
                        uuid = VALUES(uuid),
                        date = VALUES(date), department = VALUES(department), project = VALUES(project),
                        responsible_person = VALUES(responsible_person), team = VALUES(team), title = VALUES(title),
                        goal = VALUES(goal), start_date = VALUES(start_date), due_date = VALUES(due_date),
                        milestones = VALUES(milestones), is_committed = VALUES(is_committed), is_soft_deleted = VALUES(is_soft_deleted),
                        status = VALUES(status), priority = VALUES(priority), progress = VALUES(progress),
                        comments = VALUES(comments), attachments = VALUES(attachments), dependencies = VALUES(dependencies),
                        last_viewed_by = VALUES(last_viewed_by), reviewer = VALUES(reviewer), evaluation = VALUES(evaluation),
                        parent_id = VALUES(parent_id), hierarchy_type = VALUES(hierarchy_type), track_id = VALUES(track_id)";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                ':id' => $t['id'],
                ':uuid' => $t['uuid'] ?? $t['id'], // フォールバック
                ':sheet_name' => $sheet_name,
                ':date' => $t['date'] ?? '',
                ':department' => $t['department'] ?? '',
                ':project' => $t['project'] ?? '',
                ':responsible_person' => $t['responsiblePerson'] ?? '',
                ':team' => is_array($t['team'] ?? null) ? json_encode($t['team']) : ($t['team'] ?? '[]'),
                ':title' => $t['title'] ?? '',
                ':goal' => $t['goal'] ?? '',
                ':start_date' => $t['startDate'] ?? '',
                ':due_date' => $t['dueDate'] ?? '',
                ':milestones' => is_array($t['milestones'] ?? null) ? json_encode($t['milestones']) : ($t['milestones'] ?? '[]'),
                ':is_committed' => !empty($t['isCommitted']) && $t['isCommitted'] !== 'false' && $t['isCommitted'] !== false ? 1 : 0,
                ':is_soft_deleted' => !empty($t['isSoftDeleted']) && $t['isSoftDeleted'] !== 'false' && $t['isSoftDeleted'] !== false ? 1 : 0,
                ':status' => $t['status'] ?? 'TODO',
                ':priority' => $t['priority'] ?? 'MEDIUM',
                ':progress' => is_array($t['progress'] ?? null) ? json_encode($t['progress']) : ($t['progress'] ?? '[]'),
                ':comments' => is_array($t['comments'] ?? null) ? json_encode($t['comments']) : ($t['comments'] ?? '[]'),
                ':attachments' => is_array($t['attachments'] ?? null) ? json_encode($t['attachments']) : ($t['attachments'] ?? '[]'),
                ':dependencies' => is_array($t['dependencies'] ?? null) ? json_encode($t['dependencies']) : ($t['dependencies'] ?? '[]'),
                ':last_viewed_by' => is_array($t['lastViewedBy'] ?? null) ? json_encode($t['lastViewedBy']) : ($t['lastViewedBy'] ?? '[]'),
                ':reviewer' => $t['reviewer'] ?? '',
                ':evaluation' => is_array($t['evaluation'] ?? null) || is_object($t['evaluation'] ?? null) ? json_encode($t['evaluation']) : ($t['evaluation'] ?? 'null'),
                ':parent_id' => $t['parentId'] ?? '',
                ':hierarchy_type' => $t['hierarchyType'] ?? 'root',
                ':track_id' => $t['trackId'] ?? ''
            ]);

            echo json_encode(['status' => 'success']);
            exit;
        }

        if ($action === 'sync_all') {
            $tasks = $data['tasks'] ?? [];
            $pc = $data['projectConcept'] ?? null;

            $pdo->beginTransaction();
            // タスク一括UPSERT
            $stmt = $pdo->prepare("INSERT INTO tasks (
                        id, uuid, sheet_name, date, department, project, responsible_person, team, title, goal, start_date, due_date,
                        milestones, is_committed, is_soft_deleted, status, priority, progress, comments, attachments, dependencies,
                        last_viewed_by, reviewer, evaluation, parent_id, hierarchy_type, track_id
                    ) VALUES (
                        :id, :uuid, :sheet_name, :date, :department, :project, :responsible_person, :team, :title, :goal, :start_date, :due_date,
                        :milestones, :is_committed, :is_soft_deleted, :status, :priority, :progress, :comments, :attachments, :dependencies,
                        :last_viewed_by, :reviewer, :evaluation, :parent_id, :hierarchy_type, :track_id
                    ) ON DUPLICATE KEY UPDATE
                        uuid = VALUES(uuid), date = VALUES(date), department = VALUES(department), project = VALUES(project),
                        responsible_person = VALUES(responsible_person), team = VALUES(team), title = VALUES(title),
                        goal = VALUES(goal), start_date = VALUES(start_date), due_date = VALUES(due_date),
                        milestones = VALUES(milestones), is_committed = VALUES(is_committed), is_soft_deleted = VALUES(is_soft_deleted),
                        status = VALUES(status), priority = VALUES(priority), progress = VALUES(progress),
                        comments = VALUES(comments), attachments = VALUES(attachments), dependencies = VALUES(dependencies),
                        last_viewed_by = VALUES(last_viewed_by), reviewer = VALUES(reviewer), evaluation = VALUES(evaluation),
                        parent_id = VALUES(parent_id), hierarchy_type = VALUES(hierarchy_type), track_id = VALUES(track_id)");
            
            foreach ($tasks as $t) {
                // sync_allでは配列化済みのものが来る場合があるため型の調整
                $stmt->execute([
                    ':id' => $t['id'],
                    ':uuid' => $t['uuid'] ?? $t['id'],
                    ':sheet_name' => $sheet_name,
                    ':date' => $t['date'] ?? '',
                    ':department' => $t['department'] ?? '',
                    ':project' => $t['project'] ?? '',
                    ':responsible_person' => $t['responsiblePerson'] ?? ($t['responsible_person'] ?? ''),
                    ':team' => is_array($t['team'] ?? null) ? json_encode($t['team']) : ($t['team'] ?? '[]'),
                    ':title' => $t['title'] ?? '',
                    ':goal' => $t['goal'] ?? '',
                    ':start_date' => $t['startDate'] ?? ($t['start_date'] ?? ''),
                    ':due_date' => $t['dueDate'] ?? ($t['due_date'] ?? ''),
                    ':milestones' => is_array($t['milestones'] ?? null) ? json_encode($t['milestones']) : ($t['milestones'] ?? '[]'),
                    ':is_committed' => !empty($t['isCommitted']) && $t['isCommitted'] !== 'false' && $t['isCommitted'] !== false ? 1 : 0,
                    ':is_soft_deleted' => (!empty($t['isSoftDeleted']) || !empty($t['is_soft_deleted'])) && $t['isSoftDeleted'] !== 'false' ? 1 : 0,
                    ':status' => $t['status'] ?? 'TODO',
                    ':priority' => $t['priority'] ?? 'MEDIUM',
                    ':progress' => is_array($t['progress'] ?? null) ? json_encode($t['progress']) : ($t['progress'] ?? '[]'),
                    ':comments' => is_array($t['comments'] ?? null) ? json_encode($t['comments']) : ($t['comments'] ?? '[]'),
                    ':attachments' => is_array($t['attachments'] ?? null) ? json_encode($t['attachments']) : ($t['attachments'] ?? '[]'),
                    ':dependencies' => is_array($t['dependencies'] ?? null) ? json_encode($t['dependencies']) : ($t['dependencies'] ?? '[]'),
                    ':last_viewed_by' => is_array($t['lastViewedBy'] ?? null) ? json_encode($t['lastViewedBy']) : ($t['lastViewedBy'] ?? '[]'),
                    ':reviewer' => $t['reviewer'] ?? '',
                    ':evaluation' => is_array($t['evaluation'] ?? null) || is_object($t['evaluation'] ?? null) ? json_encode($t['evaluation']) : ($t['evaluation'] ?? 'null'),
                    ':parent_id' => $t['parentId'] ?? ($t['parent_id'] ?? ''),
                    ':hierarchy_type' => $t['hierarchyType'] ?? ($t['hierarchy_type'] ?? 'root'),
                    ':track_id' => $t['trackId'] ?? ($t['track_id'] ?? '')
                ]);
            }
            // コンセプト
            if ($pc) {
                $stmt_pc = $pdo->prepare("INSERT INTO project_concepts (sheet_name, name, content, attachments) VALUES (:sheet_name, :name, :content, :attachments)
                                            ON DUPLICATE KEY UPDATE name = VALUES(name), content = VALUES(content), attachments = VALUES(attachments)");
                $stmt_pc->execute([
                    ':sheet_name' => $sheet_name,
                    ':name' => $pc['name'] ?? '',
                    ':content' => $pc['content'] ?? '',
                    ':attachments' => is_array($pc['attachments'] ?? null) ? json_encode($pc['attachments']) : '[]'
                ]);
            }
            $pdo->commit();
            echo json_encode(['status' => 'success']);
            exit;
        }

        if ($action === 'save_concept') {
            $pc = $data['projectConcept'] ?? [];
            $stmt = $pdo->prepare("INSERT INTO project_concepts (sheet_name, name, content, attachments) VALUES (:sheet_name, :name, :content, :attachments)
                                        ON DUPLICATE KEY UPDATE name = VALUES(name), content = VALUES(content), attachments = VALUES(attachments)");
            $stmt->execute([
                ':sheet_name' => $sheet_name,
                ':name' => $pc['name'] ?? '',
                ':content' => $pc['content'] ?? '',
                ':attachments' => is_array($pc['attachments'] ?? null) ? json_encode($pc['attachments']) : '[]'
            ]);
            echo json_encode(['status' => 'success']);
            exit;
        }

        if ($action === 'save_epics') {
            $epics = $data['epics'] ?? [];
            $pdo->beginTransaction();
            $stmt_del = $pdo->prepare("DELETE FROM epics WHERE sheet_name = :sheet_name");
            $stmt_del->execute([':sheet_name' => $sheet_name]);
            
            $stmt_ins = $pdo->prepare("INSERT INTO epics (sheet_name, name) VALUES (:sheet_name, :name)");
            foreach ($epics as $e) {
                if (trim($e)) {
                    $stmt_ins->execute([':sheet_name' => $sheet_name, ':name' => trim($e)]);
                }
            }
            $pdo->commit();
            echo json_encode(['status' => 'success']);
            exit;
        }

        if ($action === 'save_portal_users') {
            $users = $data['users'] ?? [];
            $pdo->beginTransaction();
            // IDが無い場合は追加のみだが、基本はUPSERT
            $stmt = $pdo->prepare("INSERT INTO portal_users (employee_id, name, department, portal_password, role) VALUES (:employee_id, :name, :department, :portal_password, :role)
                                    ON DUPLICATE KEY UPDATE name = VALUES(name), department = VALUES(department), portal_password = VALUES(portal_password), role = VALUES(role)");
            foreach ($users as $u) {
                if (trim($u['employeeId'])) {
                    $stmt->execute([
                        ':employee_id' => $u['employeeId'],
                        ':name' => $u['name'] ?? '',
                        ':department' => $u['department'] ?? '',
                        ':portal_password' => $u['portalPassword'] ?? '',
                        ':role' => $u['role'] ?? 'user'
                    ]);
                }
            }
            $pdo->commit();
            echo json_encode(['status' => 'success']);
            exit;
        }

        // ゴールエピック一括保存（部署+役職+年度単位で洗い替え）
        if ($action === 'save_goal_epics') {
            $epics      = $data['epics'] ?? [];
            $fiscal     = (int)($data['fiscalYear'] ?? 0);
            $half       = $data['halfPeriod'] ?? '';
            $dept       = $data['department'] ?? '';
            $title      = $data['evaluatorTitle'] ?? '';

            if (empty($epics)) {
                echo json_encode(['status' => 'error', 'message' => 'epics is empty']);
                exit;
            }

            $pdo->beginTransaction();

            // 同じ部署+役職+年度+期 のデータを洗い替え
            $stmt_del = $pdo->prepare(
                "DELETE FROM goal_epics WHERE department = :dept AND evaluator_title = :title AND fiscal_year = :fiscal AND half_period = :half"
            );
            $stmt_del->execute([':dept' => $dept, ':title' => $title, ':fiscal' => $fiscal, ':half' => $half]);

            $stmt_ins = $pdo->prepare(
                "INSERT INTO goal_epics (id, department, evaluator_title, epic_name, due_date, goal, rule, weight, fiscal_year, half_period, status)
                 VALUES (:id, :dept, :title, :epic_name, :due_date, :goal, :rule, :weight, :fiscal, :half, :status)"
            );
            foreach ($epics as $e) {
                $stmt_ins->execute([
                    ':id'        => $e['id']            ?? uniqid('ge_', true),
                    ':dept'      => $dept,
                    ':title'     => $title,
                    ':epic_name' => $e['name']          ?? '',
                    ':due_date'  => $e['dueDate']        ?? '',
                    ':goal'      => $e['goal']           ?? '',
                    ':rule'      => $e['rule']           ?? '',
                    ':weight'    => (float)($e['weight'] ?? 0),
                    ':fiscal'    => $fiscal,
                    ':half'      => $half,
                    ':status'    => $e['status']         ?? 'active',
                ]);
            }
            $pdo->commit();
            echo json_encode(['status' => 'success', 'inserted' => count($epics)]);
            exit;
        }

        if ($action === 'create_project_sheet') {
            // MySQLではテーブルは共通（sheet_name）で管理するため実質何もしなくてよい（成功として返す）
            echo json_encode(['status' => 'success']);
            exit;
        }

        echo json_encode(['status' => 'error', 'message' => 'Unknown action: ' . escapeshellarg($action)]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
