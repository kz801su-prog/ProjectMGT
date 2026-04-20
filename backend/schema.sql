CREATE TABLE IF NOT EXISTS `tasks` (
  `id` VARCHAR(100) PRIMARY KEY,
  `uuid` VARCHAR(100) NOT NULL,
  `sheet_name` VARCHAR(100) NOT NULL,
  `date` VARCHAR(20),
  `department` VARCHAR(100),
  `project` VARCHAR(100),
  `responsible_person` VARCHAR(100),
  `team` TEXT,
  `title` TEXT,
  `goal` TEXT,
  `start_date` VARCHAR(20),
  `due_date` VARCHAR(20),
  `milestones` TEXT,
  `is_committed` TINYINT(1) DEFAULT 0,
  `is_soft_deleted` TINYINT(1) DEFAULT 0,
  `status` VARCHAR(50),
  `priority` VARCHAR(50),
  `progress` TEXT,
  `comments` TEXT,
  `attachments` TEXT,
  `dependencies` TEXT,
  `last_viewed_by` TEXT,
  `reviewer` VARCHAR(100),
  `evaluation` TEXT,
  `parent_id` VARCHAR(100),
  `hierarchy_type` VARCHAR(50),
  `track_id` VARCHAR(100),
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_sheet_name` (`sheet_name`),
  INDEX `idx_uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `project_concepts` (
  `sheet_name` VARCHAR(100) PRIMARY KEY,
  `name` VARCHAR(255),
  `content` TEXT,
  `attachments` TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `epics` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sheet_name` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255),
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sheet_name` (`sheet_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 目標ファイルから生成されたエピック（部署+役職単位）
CREATE TABLE IF NOT EXISTS `goal_epics` (
  `id` VARCHAR(100) PRIMARY KEY,
  `department` VARCHAR(200) NOT NULL,      -- 部署名 (A列)
  `evaluator_title` VARCHAR(200) NOT NULL, -- 役職名 (B列)
  `epic_name` VARCHAR(500) NOT NULL,       -- 役割定義/エピック名 (C列)
  `due_date` VARCHAR(50),                  -- いつまで (D列)
  `goal` TEXT,                             -- どのような状態 (E列)
  `rule` TEXT,                             -- ルール (F列)
  `weight` DECIMAL(5,2) DEFAULT 0,         -- 重み配分% (G列)
  `fiscal_year` SMALLINT,                  -- 対象年度
  `half_period` VARCHAR(2),                -- H1 / H2
  `status` VARCHAR(20) DEFAULT 'active',
  `score` DECIMAL(5,2),                    -- 評価スコア
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_dept_title` (`department`(100), `evaluator_title`(100)),
  INDEX `idx_fiscal` (`fiscal_year`, `half_period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `portal_users` (
  `employee_id` VARCHAR(100) PRIMARY KEY,
  `name` VARCHAR(255),
  `department` VARCHAR(100),
  `portal_password` VARCHAR(255),
  `role` VARCHAR(50) DEFAULT 'user',
  `allowed_project_ids` JSON DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 既存テーブルへのカラム追加（初回のみ実行、エラーは無視）
-- ALTER TABLE `portal_users` ADD COLUMN IF NOT EXISTS `allowed_project_ids` JSON DEFAULT NULL;
