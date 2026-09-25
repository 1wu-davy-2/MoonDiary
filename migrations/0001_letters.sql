-- 月笺：一张卡片 = 一行 letters；每次被打开 = 一行 letter_views。
--
-- utf8mb4 是硬要求：正文和署名是中文，utf8（3 字节）存不下 emoji，
-- 而中秋祝福里 emoji 很常见。排序规则用 unicode_ci 保证中文排序正确。

CREATE TABLE IF NOT EXISTS letters (
  id         CHAR(8)      NOT NULL COMMENT '短码，分享链接 /l/<id>',
  to_name    VARCHAR(16)  NOT NULL COMMENT '写给谁',
  from_name  VARCHAR(16)  NOT NULL COMMENT '署名',
  tone       VARCHAR(16)  NOT NULL COMMENT '语气：heart/easy/poem/play',
  message    VARCHAR(80)  NOT NULL COMMENT '正文',
  created_ip VARCHAR(64)  NOT NULL COMMENT '创建者 IP',
  created_ua VARCHAR(255) NULL     COMMENT '创建者 User-Agent',
  views      INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '打开次数（去重后）',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='月笺正文与创建信息';

CREATE TABLE IF NOT EXISTS letter_views (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  letter_id  CHAR(8)      NOT NULL,
  ip         VARCHAR(64)  NOT NULL COMMENT '访问者 IP',
  user_agent VARCHAR(255) NULL,
  referer    VARCHAR(255) NULL COMMENT '从哪跳来的',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_letter_time (letter_id, created_at),
  CONSTRAINT fk_views_letter FOREIGN KEY (letter_id)
    REFERENCES letters (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='月笺访问记录';
