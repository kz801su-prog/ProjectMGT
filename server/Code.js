// ==========================================
// Project MGT - Multi-Project Backend
// Google Apps Script (GAS)
// Version: 6.0 - Multi-Project & Portal Users
// ==========================================

// 1. 設定セクション
const TARGET_GID = 2043314835; // 既存「決定事項」シートのGID (SincolLeather用)
const DEFAULT_SHEET_NAME = '決定事項';
const PORTAL_USERS_SHEET_NAME = 'portal_users'; // ポータルユーザー管理シート

// デフォルトのWebhook URL
const DEFAULT_CLIQ_WEBHOOK_URL = 'https://cliq.zoho.com/company/719554203/api/v2/channelsbyname/tnzcd/message?zapikey=1001.c4e498597d7ecb17a361dc28ca531e5a.08ffaf17c758fce2840d1bae11abb486';

// ==========================================
// ユーティリティ
// ==========================================
function getSheetByGid(ss, gid) {
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === String(gid)) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * プロジェクト名からシートを取得（なければ自動作成）
 */
function getProjectSheet(ss, sheetName, createIfMissing) {
  if (!sheetName) {
    // sheetNameが未指定なら既存のGID指定シートを使う (後方互換)
    let sheet = getSheetByGid(ss, TARGET_GID);
    if (!sheet) sheet = ss.getSheetByName(DEFAULT_SHEET_NAME);
    return sheet || ss.getSheets()[0];
  }

  let sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  if (!createIfMissing) return null;

  // 新規作成
  sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1).setValue("Project: " + sheetName);
  sheet.getRange(2, 1).setValue("Last Updated: " + new Date());
  const headers = [
    '作成日', '責任者', '部署', 'タイトル', '詳細(予備)',
    'ステータス', '優先度', '進捗履歴', '完了予定日', '重要フラグ',
    '確認者', 'チーム', '開始日', 'ゴール定義', 'マイルストーン', 'エピック名',
    'コメント', '添付ファイル', '依存関係', '評価データ', 'UUID', 'ParentID', 'HierarchyType', 'TrackID', '既読情報'
  ];
  sheet.getRange(3, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(3, 1, 1, headers.length).setFontWeight("bold").setBackground("#f0f0f0");
  return sheet;
}

/**
 * ポータルユーザー管理シートを取得（なければ作成）
 */
function getPortalUsersSheet(ss) {
  let sheet = ss.getSheetByName(PORTAL_USERS_SHEET_NAME);
  if (sheet) return sheet;

  // 新規作成: ヘッダー = 社員ID | 人名 | 部門 | ポータルパスワード | ロール
  sheet = ss.insertSheet(PORTAL_USERS_SHEET_NAME);
  sheet.getRange(1, 1).setValue("Portal Users - " + new Date().toLocaleDateString());
  const headers = ['社員ID', '人名', '部門', 'ポータルPW', 'ロール'];
  sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, 1, headers.length).setFontWeight("bold").setBackground("#f0f0f0");
  // 列幅調整
  sheet.setColumnWidth(1, 100); // 社員ID
  sheet.setColumnWidth(2, 150); // 人名
  sheet.setColumnWidth(3, 150); // 部門
  sheet.setColumnWidth(4, 150); // ポータルPW
  sheet.setColumnWidth(5, 100); // ロール
  return sheet;
}

/**
 * 毎週月曜日の朝8時に実行されるレポート機能
 */
function weeklyReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = getSheetByGid(ss, TARGET_GID);
  if (!sheet) return;

  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 3) return;

  const tasks = data.slice(3);
  const pendingTasks = tasks.filter(row => row[5] !== 'COMPLETED' && row[5] !== '完了');

  if (pendingTasks.length === 0) return;

  let reportText = "### 【週次進捗確認】未完了タスク一覧 ###\\\\n\\\\n";
  pendingTasks.slice(0, 15).forEach(task => {
    reportText += `* ${task[3]} (担当: ${task[1]} / 期限: ${task[8] || '未定'})\\\\n`;
  });

  if (pendingTasks.length > 15) {
    reportText += `\\\\n他 ${pendingTasks.length - 15} 件の未完了タスクがあります。`;
  }

  const webhookUrl = getCliqWebhookUrl();
  const message = {
    text: reportText,
    bot: { name: "Project MGT", image: "https://www.google.com/s2/favicons?domain=sincol-leather.jp" }
  };

  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(message)
  });
}

// ==========================================
// doGet - データ読み取り
// ==========================================
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'get_tasks';
    const sheetName = (e && e.parameter && e.parameter.sheetName) ? e.parameter.sheetName : '';

    // --- ACTION: GET PORTAL USERS ---
    if (action === 'get_portal_users') {
      const usersSheet = getPortalUsersSheet(ss);
      const data = usersSheet.getDataRange().getDisplayValues();
      // ヘッダー行(row 2)以降がユーザーデータ
      const users = [];
      for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row[0] && !row[1]) continue; // 空行スキップ
        users.push({
          employeeId: row[0] || '',
          name: row[1] || '',
          department: row[2] || '',
          portalPassword: row[3] || '',
          role: row[4] || 'user'
        });
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        users: users
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACTION: LIST SHEETS (プロジェクト一覧) ---
    if (action === 'list_sheets') {
      const sheets = ss.getSheets();
      const sheetList = sheets
        .map(s => ({ name: s.getName(), gid: s.getSheetId() }))
        .filter(s => s.name !== PORTAL_USERS_SHEET_NAME && s.name !== 'secrets');
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        sheets: sheetList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACTION: GET TASKS (default) ---
    let sheet = getProjectSheet(ss, sheetName, false);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Sheet not found: ' + (sheetName || DEFAULT_SHEET_NAME)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const dataRange = sheet.getDataRange();
    const dataStartPhysicalRow = dataRange.getRow();
    const data = dataRange.getDisplayValues();

    // ヘッダー行を動的に特定 (列Dが「タイトル」である行を探す)
    let headerRowIndex = 2; // デフォルトは3行目(index 2)
    for (let i = 0; i < Math.min(15, data.length); i++) {
      if (data[i][3] === 'タイトル') {
        headerRowIndex = i;
        break;
      }
    }

    // 既存タスクにUUIDが空のものがあれば自動付与
    const headerPhysicalRow = dataStartPhysicalRow + headerRowIndex;
    const itemsStartRow = headerPhysicalRow + 1;
    const lastRow = sheet.getLastRow();

    if (lastRow >= itemsStartRow) {
      const uuidsRange = sheet.getRange(itemsStartRow, 21, lastRow - itemsStartRow + 1, 1);
      const uuids = uuidsRange.getValues();
      let changed = false;
      for (let i = 0; i < uuids.length; i++) {
        const u = String(uuids[i][0]).trim();
        if (!u) {
          uuids[i][0] = Utilities.getUuid();
          changed = true;
        }
      }
      if (changed) {
        uuidsRange.setValues(uuids);
      }
    }

    // UUID付与後の最新スプレッドシートデータで返す
    const finalData = sheet.getDataRange().getDisplayValues();
    const rows = finalData.length > headerRowIndex + 1 ? finalData.slice(headerRowIndex + 1) : [];

    // プロジェクトコンセプトを1行目2列目から取得
    let projectConcept = null;
    try {
      const conceptJson = sheet.getRange(1, 2).getValue();
      if (conceptJson) projectConcept = JSON.parse(conceptJson);
    } catch (e) { }

    // エピックをScriptPropertiesから取得 (プロジェクト別)
    const epicsKey = sheetName ? ('EPICS_' + sheetName) : 'EPICS';
    const epicsStr = PropertiesService.getScriptProperties().getProperty(epicsKey);
    const epics = epicsStr ? JSON.parse(epicsStr) : [];

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: rows,
      projectConcept: projectConcept,
      epics: epics
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// doPost - データ書き込み
// ==========================================
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const success = lock.tryLock(15000);
    if (!success) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'サーバーが混雑しています。少し待ってから再試行してください。'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    let jsonString = '';
    if (e && e.postData && e.postData.contents) {
      jsonString = e.postData.contents;
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No post data' })).setMimeType(ContentService.MimeType.JSON);
    }

    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid JSON: ' + parseError.toString() })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = data.sheetName || '';

    // ============================
    // PORTAL USERS 管理
    // ============================

    // --- ACTION: SAVE PORTAL USERS ---
    if (data.action === 'save_portal_users') {
      const usersSheet = getPortalUsersSheet(ss);
      const users = data.users || [];

      // ヘッダー以降をクリア
      const lastRow = usersSheet.getLastRow();
      if (lastRow > 2) {
        usersSheet.getRange(3, 1, lastRow - 2, 5).clearContent();
      }

      // ユーザーデータを書き込み
      if (users.length > 0) {
        const rows = users.map(u => [
          u.employeeId || '',
          u.name || '',
          u.department || '',
          u.portalPassword || '',
          u.role || 'user'
        ]);
        usersSheet.getRange(3, 1, rows.length, 5).setValues(rows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success', count: users.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACTION: CREATE PROJECT SHEET ---
    if (data.action === 'create_project_sheet') {
      const newSheetName = data.projectSheetName;
      if (!newSheetName) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'projectSheetName is required' })).setMimeType(ContentService.MimeType.JSON);
      }
      const sheet = getProjectSheet(ss, newSheetName, true); // 自動作成
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        sheetName: sheet.getName(),
        gid: sheet.getSheetId()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ============================
    // タスク管理 (既存機能 + sheetName対応)
    // ============================
    let sheet = getProjectSheet(ss, sheetName, true);

    // --- 行フォーマット関数 ---
    const formatRow = (t) => {
      let progressStr = "";
      if (Array.isArray(t.progress)) {
        const reversedProgress = [...t.progress].reverse();
        progressStr = reversedProgress.map(p => `[${p.updatedAt}] ${p.content}`).join(' | ');
      }

      const teamStr = Array.isArray(t.team) ? JSON.stringify(t.team) : (t.team || '[]');
      const milestonesStr = Array.isArray(t.milestones) ? JSON.stringify(t.milestones) : (t.milestones || '[]');
      const commentsStr = Array.isArray(t.comments) ? JSON.stringify(t.comments) : (t.comments || '[]');
      const attachmentsStr = Array.isArray(t.attachments) ? JSON.stringify(t.attachments) : (t.attachments || '[]');
      const dependenciesStr = Array.isArray(t.dependencies) ? JSON.stringify(t.dependencies) : (t.dependencies || '[]');
      const evaluationStr = (typeof t.evaluation === 'object' && t.evaluation !== null) ? JSON.stringify(t.evaluation) : (t.evaluation || 'null');
      const lastViewedByStr = Array.isArray(t.lastViewedBy) ? JSON.stringify(t.lastViewedBy) : (t.lastViewedBy || '[]');

      return [
        t.date, t.responsiblePerson, t.department, t.title, t.isSoftDeleted ? 'SOFT_DELETE' : '',
        t.status, t.priority, progressStr, t.dueDate,
        t.isCommitted ? 'TRUE' : 'FALSE', t.reviewer,
        teamStr, t.startDate, t.goal, milestonesStr, t.project || '',
        commentsStr, attachmentsStr, dependenciesStr, evaluationStr, t.uuid || '',
        t.parentId || '', t.hierarchyType || '', t.trackId || '', lastViewedByStr
      ];
    };

    // --- ACTION: SAVE SINGLE TASK (Upsert) ---
    if (data.action === 'save_task') {
      const task = data.task;
      const taskId = data.taskId;
      const rowData = formatRow(task);

      let targetRow = -1;

      // ヘッダー行を特定
      const allData = sheet.getDataRange().getValues();
      let hIdx = 2;
      for (let hi = 0; hi < Math.min(15, allData.length); hi++) {
        if (allData[hi][3] === 'タイトル') { hIdx = hi; break; }
      }
      const dataStartRow = hIdx + 2;

      if (taskId && String(taskId).indexOf('sheet-') === 0) {
        const parsed = parseInt(String(taskId).replace('sheet-', ''), 10);
        if (!isNaN(parsed) && parsed >= dataStartRow && parsed <= sheet.getLastRow()) {
          targetRow = parsed;
        }
      }

      if (targetRow === -1 && task.uuid && sheet.getLastRow() >= dataStartRow) {
        const uCol = sheet.getRange(dataStartRow, 21, sheet.getLastRow() - dataStartRow + 1, 1).getValues();
        for (let ui = 0; ui < uCol.length; ui++) {
          if (String(uCol[ui][0]).trim() === String(task.uuid).trim()) {
            targetRow = ui + dataStartRow;
            break;
          }
        }
      }

      if (targetRow >= dataStartRow && targetRow <= sheet.getLastRow()) {
        sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }

      sheet.getRange(2, 1).setValue("Last Updated: " + new Date());
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success', taskId: taskId, targetRow: targetRow
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACTION: SAVE CONCEPT ---
    if (data.action === 'save_concept') {
      if (data.projectConcept) {
        sheet.getRange(1, 2).setValue(JSON.stringify(data.projectConcept));
      }
      sheet.getRange(2, 1).setValue("Last Updated: " + new Date());
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACTION: SYNC ALL ---
    if (data.action === 'sync_all') {
      const tasks = data.tasks;
      const rows = tasks.map(formatRow);

      const sheetDataForSync = sheet.getDataRange().getValues();
      let headerRowIndexSync = 2;
      for (let i = 0; i < Math.min(15, sheetDataForSync.length); i++) {
        if (sheetDataForSync[i][3] === 'タイトル') {
          headerRowIndexSync = i;
          break;
        }
      }
      const syncDataStartRow = headerRowIndexSync + 2;

      const lastRow = sheet.getLastRow();
      if (lastRow >= syncDataStartRow) {
        sheet.getRange(syncDataStartRow, 1, lastRow - syncDataStartRow + 1, 25).clearContent();
      }

      if (rows.length > 0) {
        sheet.getRange(syncDataStartRow, 1, rows.length, 25).setValues(rows);
      }

      if (data.projectConcept) {
        sheet.getRange(1, 2).setValue(JSON.stringify(data.projectConcept));
      }

      sheet.getRange(2, 1).setValue("Last Updated: " + new Date());
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', count: rows.length })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACTION: SAVE EPICS ---
    if (data.action === 'save_epics') {
      const epicsKey = sheetName ? ('EPICS_' + sheetName) : 'EPICS';
      PropertiesService.getScriptProperties().setProperty(epicsKey, JSON.stringify(data.epics || []));
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action: ' + (data.action || 'none') })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // ロック解放エラーは無視
    }
  }
}

// ==========================================
// ユーティリティ関数
// ==========================================
function getCliqWebhookUrl() {
  return PropertiesService.getScriptProperties().getProperty('CLIQ_WEBHOOK_URL') || DEFAULT_CLIQ_WEBHOOK_URL;
}

function sendCliqNotification(task, template, webhookUrl) {
  if (!webhookUrl) return;
  const text = `### 新規タスク登録 ###\n\n**${task.title}**\n* 担当: ${task.responsiblePerson}\n* 期限: ${task.dueDate || '未定'}`;
  const message = {
    text: text,
    bot: { name: "Project MGT", image: "https://www.google.com/s2/favicons?domain=sincol-leather.jp" }
  };
  try { UrlFetchApp.fetch(webhookUrl, { method: 'post', contentType: 'application/json', payload: JSON.stringify(message) }); } catch (e) { }
}