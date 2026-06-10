#include "MsgPersistMgr.h"
#include "MysqlMgr.h"
#include <algorithm>
#include <cstdlib>
#include <iostream>

namespace {
	// Read a positive size_t from an environment variable, clamped to max_value.
	size_t ReadSizeEnv(const char* name, size_t default_value, size_t max_value) {
		char value[32] = {};
		size_t required = 0;
		if (getenv_s(&required, value, sizeof(value), name) == 0 && required > 1) {
			auto parsed = static_cast<size_t>(std::atoi(value));
			if (parsed > 0) {
				return std::min(parsed, max_value);
			}
		}
		return default_value;
	}
}

MsgPersistMgr::MsgPersistMgr() : _stop(false) {
	// One logical message at high fanout still maps to a single stored row, so a
	// single writer with batching is enough; batch size is tunable per machine.
	_batch_size = ReadSizeEnv("MINICHAT_PERSIST_BATCH", 128, 1000);
	_worker = std::thread(&MsgPersistMgr::WorkerLoop, this);
}

MsgPersistMgr::~MsgPersistMgr() {
	Close();
}

std::string MsgPersistMgr::MakeSessionId(int uid_a, int uid_b) {
	int low = std::min(uid_a, uid_b);
	int high = std::max(uid_a, uid_b);
	return std::to_string(low) + "_" + std::to_string(high);
}

std::string MsgPersistMgr::GroupSessionId(long long group_id) {
	return std::string(GROUP_SESSION_PREFIX) + std::to_string(group_id);
}

void MsgPersistMgr::PushTextMsgs(int from_uid, int to_uid, const Json::Value& text_array) {
	PushMessages(MakeSessionId(from_uid, to_uid), from_uid, to_uid, text_array);
}

void MsgPersistMgr::PushMessages(const std::string& session_id, int from_uid, int to_uid,
	const Json::Value& text_array) {
	if (!text_array.isArray() || text_array.empty()) {
		return;
	}

	std::vector<ChatMsgInfo> records;
	records.reserve(text_array.size());
	for (const auto& txt_obj : text_array) {
		ChatMsgInfo info;
		info.session_id = session_id;
		info.from_uid = from_uid;
		info.to_uid = to_uid;
		info.unique_id = txt_obj.get("msgid", "").asString();
		info.content = txt_obj.get("content", "").asString();
		records.push_back(std::move(info));
	}

	{
		std::lock_guard<std::mutex> lock(_mutex);
		if (_stop) {
			return;
		}
		for (auto& rec : records) {
			_queue.push(std::move(rec));
		}
	}
	_cond.notify_one();
}

void MsgPersistMgr::WorkerLoop() {
	while (true) {
		std::vector<ChatMsgInfo> batch;
		{
			std::unique_lock<std::mutex> lock(_mutex);
			_cond.wait(lock, [this] { return _stop || !_queue.empty(); });
			if (_stop && _queue.empty()) {
				return;
			}
			while (!_queue.empty() && batch.size() < _batch_size) {
				batch.push_back(std::move(_queue.front()));
				_queue.pop();
			}
		}
		FlushBatch(batch);
	}
}

void MsgPersistMgr::FlushBatch(std::vector<ChatMsgInfo>& batch) {
	if (batch.empty()) {
		return;
	}
	// Persistence failures must never crash the writer thread; messages are
	// best-effort and the live delivery / Redis offline queue is the fast path.
	if (!MysqlMgr::GetInstance()->SaveChatMsgs(batch)) {
		std::cout << "persist chat messages failed, dropped " << batch.size() << " rows" << std::endl;
	}
}

void MsgPersistMgr::Close() {
	{
		std::lock_guard<std::mutex> lock(_mutex);
		if (_stop) {
			return;
		}
		_stop = true;
	}
	_cond.notify_all();
	if (_worker.joinable()) {
		_worker.join();
	}
}
