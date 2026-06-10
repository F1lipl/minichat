-- 聊天消息持久化表
--
-- 设计要点：
--   * msg_id 为全局自增主键，天然有序，用作分页游标与消息排序依据。
--   * session_id 采用「较小uid_较大uid」的规整形式（见 MsgPersistMgr::MakeSessionId），
--     保证一对一会话双向一致，单聊只存一份。
--   * (session_id, unique_id) 唯一键 + 写入端 INSERT IGNORE 实现幂等去重，
--     避免重复投递/跨服转发造成的重复落库。
--   * idx_session_msg 支撑按会话 + msg_id 游标翻页的历史查询。
--
-- 字符集使用 utf8mb4 以支持 emoji 等四字节字符。

CREATE TABLE IF NOT EXISTS `chat_message` (
  `msg_id`      BIGINT       NOT NULL AUTO_INCREMENT COMMENT '全局有序消息id',
  `session_id`  VARCHAR(64)  NOT NULL COMMENT '会话id，单聊为 minUid_maxUid',
  `from_uid`    INT          NOT NULL COMMENT '发送方uid',
  `to_uid`      INT          NOT NULL COMMENT '接收方uid',
  `unique_id`   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '客户端消息id，用于去重',
  `content`     TEXT         NOT NULL COMMENT '消息内容',
  `status`      TINYINT      NOT NULL DEFAULT 0 COMMENT '0已发送 1已读（预留）',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  PRIMARY KEY (`msg_id`),
  UNIQUE KEY `uk_session_unique` (`session_id`, `unique_id`),
  KEY `idx_session_msg` (`session_id`, `msg_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='一对一聊天消息';
