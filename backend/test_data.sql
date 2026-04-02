-- =========================================================
-- テストデータ: 提示スクリーンショット（管理本部）より
-- 2プロジェクト: 管理本部/部長 ×4エピック、管理本部/課長 ×3エピック
-- 実行前に schema.sql の goal_epics テーブルが作成済みであること
-- =========================================================

-- 既存テストデータをクリア
DELETE FROM goal_epics WHERE id LIKE 'mgmt-epic-%';

-- ── プロジェクト1: 管理本部 / 部長 ──────────────────────────
INSERT INTO goal_epics
  (id, department, evaluator_title, epic_name, due_date, goal, rule, weight, fiscal_year, half_period, status)
VALUES
  ('mgmt-epic-001', '管理本部', '部長',
   '全社の経常利益', '2026-03-31',
   '経常利益予算の達成',
   '部署を越境して指示を出す権限あり',
   20, 2025, 'H2', 'active'),

  ('mgmt-epic-002', '管理本部', '部長',
   '日々の会計業務', '2026-03-31',
   'ミス/報告漏れ/報告遅れの件数に応じて評価',
   '',
   10, 2025, 'H2', 'active'),

  ('mgmt-epic-003', '管理本部', '部長',
   '外部在庫・違算のコントロール', '2026-03-31',
   '月次で管理されている',
   '毎月の会議で発表',
   10, 2025, 'H2', 'active'),

  ('mgmt-epic-004', '管理本部', '部長',
   '部下育成', '2026-03-31',
   '部長でも予算管理が出来る状態にする',
   '決められた項目を部下（部長）が出来る状態にする：日々の会計業務、残高証明の管理、固定資産台帳の維持管理',
   60, 2025, 'H2', 'active');

-- ── プロジェクト2: 管理本部 / 課長 ──────────────────────────
INSERT INTO goal_epics
  (id, department, evaluator_title, epic_name, due_date, goal, rule, weight, fiscal_year, half_period, status)
VALUES
  ('mgmt-epic-005', '管理本部', '課長',
   'イベント担当', '2026-03-31',
   '新年会/忘年会/社員会 企画及び予算達成',
   '',
   0, 2025, 'H2', 'active'),

  ('mgmt-epic-006', '管理本部', '課長',
   '雑務庶務', '2026-03-31',
   '', '',
   0, 2025, 'H2', 'active'),

  ('mgmt-epic-007', '管理本部', '課長',
   '経費精算／現金管理', '2026-03-31',
   '', '',
   0, 2025, 'H2', 'active');

-- ── 確認クエリ ────────────────────────────────────────────
SELECT
  department,
  evaluator_title,
  COUNT(*)       AS epic_count,
  SUM(weight)    AS total_weight
FROM goal_epics
WHERE id LIKE 'mgmt-epic-%'
GROUP BY department, evaluator_title;
