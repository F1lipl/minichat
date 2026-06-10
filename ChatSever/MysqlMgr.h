#pragma once
#include "const.h"
#include "MysqlDao.h"
#include "Singleton.h"
#include <vector>

class MysqlMgr : public Singleton<MysqlMgr>
{
	friend class Singleton<MysqlMgr>;
public:
	~MysqlMgr();
	int RegUser(const std::string& name, const std::string& email, const std::string& pwd);
	bool CheckEmail(const std::string& name, const std::string& email);
	bool UpdatePwd(const std::string& name, const std::string& email);
	bool CheckPwd(const std::string& name, const std::string& pwd, UserInfo& userInfo);
	bool AddFriendApply(const int& from, const int& to);
	bool AuthFriendApply(const int& from, const int& to);
	bool AddFriend(const int& from, const int& to, std::string back_name);
	std::shared_ptr<UserInfo> GetUser(int uid);
	std::shared_ptr<UserInfo> GetUser(std::string name);
	bool GetApplyList(int touid, std::vector<std::shared_ptr<ApplyInfo>>& applyList, int begin, int limit = 10);
	bool GetFriendList(int self_id, std::vector<std::shared_ptr<UserInfo> >& user_info);
	bool SaveChatMsgs(const std::vector<ChatMsgInfo>& msgs);
	bool GetChatMsgList(const std::string& session_id, long long last_id, int limit,
		std::vector<std::shared_ptr<ChatMsgInfo>>& msg_list);
	long long CreateGroup(const std::string& name, int owner_uid, const std::vector<int>& members);
	bool GetUserGroups(int uid, std::vector<std::shared_ptr<GroupInfo>>& groups);
	bool GetGroupMembers(long long group_id, std::vector<int>& uids);
	bool IsGroupMember(long long group_id, int uid);
private:
	MysqlMgr();
	MysqlDao  _dao;
};

