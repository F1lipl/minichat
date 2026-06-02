#include "UserMgr.h"

UserMgr::~UserMgr()
{
	_uid_to_sessions.clear();
}

std::shared_ptr<CSession> UserMgr::GetSession(int uid)
{
	std::lock_guard <std::mutex >lcok(_session_mtx);
	auto iter = _uid_to_sessions.find(uid);
	if (iter == _uid_to_sessions.end() || iter->second.empty()) {
		return nullptr;
	}

	return iter->second.begin()->second;
}

std::vector<std::shared_ptr<CSession>> UserMgr::GetSessions(int uid)
{
	std::lock_guard<std::mutex> lock(_session_mtx);
	std::vector<std::shared_ptr<CSession>> sessions;
	auto iter = _uid_to_sessions.find(uid);
	if (iter == _uid_to_sessions.end()) {
		return sessions;
	}

	for (auto& item : iter->second) {
		if (item.second) {
			sessions.push_back(item.second);
		}
	}
	return sessions;
}

void UserMgr::SetUserSession(int uid, std::shared_ptr<CSession> session)
{
	std::lock_guard<std::mutex>lock(_session_mtx);
	_uid_to_sessions[uid][session->GetSessionId()] = session;
	return;
}

void UserMgr::RmvUserSession(int uid, std::string session_id)
{
	std::lock_guard<std::mutex> lock(_session_mtx);
	auto iter = _uid_to_sessions.find(uid);
	if (iter == _uid_to_sessions.end()) {
		return;
	}

	iter->second.erase(session_id);
	if (iter->second.empty()) {
		_uid_to_sessions.erase(iter);
	}
}