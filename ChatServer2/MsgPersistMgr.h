#pragma once
#include "const.h"
#include "Singleton.h"
#include "UserData.h"
#include <queue>
#include <vector>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <atomic>
#include <string>

// MsgPersistMgr persists chat messages asynchronously.
//
// Why async: the text-message hot path returns the ACK before any fan-out or
// storage work (see LogicSystem::DealChatTextMsg). Doing a synchronous INSERT
// on that path would put disk IO back into request latency and undo the ACK
// optimization. Instead we push messages onto an in-memory queue and a
// dedicated worker thread drains them in batches into MySQL.
class MsgPersistMgr : public Singleton<MsgPersistMgr>
{
	friend class Singleton<MsgPersistMgr>;
public:
	~MsgPersistMgr();

	// Build ChatMsgInfo records from a client text_array and enqueue them.
	// Non-blocking: only a lock + push + notify, safe to call on the hot path.
	void PushTextMsgs(int from_uid, int to_uid, const Json::Value& text_array);

	// Persist messages under an explicit session id (used for group chats, where
	// the session is the group rather than a uid pair).
	void PushMessages(const std::string& session_id, int from_uid, int to_uid,
		const Json::Value& text_array);

	// Stop the worker thread and flush whatever is still buffered.
	void Close();

	// 1-1 session id is order independent: smaller uid first, e.g. "12_34".
	static std::string MakeSessionId(int uid_a, int uid_b);

	// Group session id, e.g. "group_42".
	static std::string GroupSessionId(long long group_id);

private:
	MsgPersistMgr();
	void WorkerLoop();
	void FlushBatch(std::vector<ChatMsgInfo>& batch);

	std::queue<ChatMsgInfo> _queue;
	std::mutex _mutex;
	std::condition_variable _cond;
	std::atomic<bool> _stop;
	std::thread _worker;
	size_t _batch_size;
};
