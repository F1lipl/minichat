-- 群聊相关表
--
-- 设计要点：
--   * chat_group 存群基本信息，group_id 自增主键。
--   * chat_group_member 存群成员关系，(group_id, uid) 联合主键天然去重，
--     idx_uid 支撑「某用户加入了哪些群」的查询（群列表）。
--   * 群消息复用 chat_message 表：session_id = "group_<group_id>"，from_uid
--     为发送者，因此历史查询、持久化逻辑全部复用一对一那套，无需新表。

CREATE TABLE IF NOT EXISTS `chat_group` (
  `group_id`    BIGINT       NOT NULL AUTO_INCREMENT COMMENT '群id',
  `name`        VARCHAR(128) NOT NULL COMMENT '群名称',
  `owner_uid`   INT          NOT NULL COMMENT '群主uid',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`group_id`),
  KEY `idx_owner` (`owner_uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天群';

CREATE TABLE IF NOT EXISTS `chat_group_member` (
  `group_id`  BIGINT   NOT NULL COMMENT '群id',
  `uid`       INT      NOT NULL COMMENT '成员uid',
  `join_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  PRIMARY KEY (`group_id`, `uid`),
  KEY `idx_uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群成员关系';
