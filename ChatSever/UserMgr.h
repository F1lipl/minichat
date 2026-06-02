#pragma once
#include "const.h"
#include "Singleton.h"
#include "CSession.h"
#include <unordered_map>
#include <vector>

class UserMgr:public Singleton<UserMgr>
{
	friend class Singleton<UserMgr>;
public:
	~UserMgr();
	std::shared_ptr<CSession> GetSession(int uid);
	std::vector<std::shared_ptr<CSession>> GetSessions(int uid);
	void SetUserSession(int uid, std::shared_ptr<CSession> session);
	void RmvUserSession(int uid, std::string session_id);

private:
	UserMgr() {};
	std::mutex _session_mtx;
	std::unordered_map<int, std::unordered_map<std::string, std::shared_ptr<CSession>>> _uid_to_sessions;
};