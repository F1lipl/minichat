#include "MysqlMgr.h"


MysqlMgr::~MysqlMgr() {

}

int MysqlMgr::RegUser(const std::string& name, const std::string& email, const std::string& pwd)
{
	return _dao.RegUser(name, email, pwd);
}

bool MysqlMgr::CheckEmail(const std::string& name, const std::string& email) {
	return _dao.CheckEmail(name, email);
}

bool MysqlMgr::UpdatePwd(const std::string& name, const std::string& pwd) {
	return _dao.UpdatePwd(name, pwd);
}

MysqlMgr::MysqlMgr() {
}

bool MysqlMgr::CheckPwd(const std::string& name, const std::string& pwd, UserInfo& userInfo) {
	return _dao.CheckPwd(name, pwd, userInfo);
}

bool MysqlMgr::AddFriendApply(const int& from, const int& to)
{
	return _dao.AddFriendApply(from, to);
}

bool MysqlMgr::AuthFriendApply(const int& from, const int& to) {
	return _dao.AuthFriendApply(from, to);
}

bool MysqlMgr::AddFriend(const int& from, const int& to, std::string back_name) {
	return _dao.AddFriend(from, to, back_name);
}

std::shared_ptr<UserInfo> MysqlMgr::GetUser(int uid)
{
	return _dao.GetUser(uid);
}

std::shared_ptr<UserInfo> MysqlMgr::GetUser(std::string name)
{
	return _dao.GetUser(name);
}

bool MysqlMgr::GetApplyList(int touid,
	std::vector<std::shared_ptr<ApplyInfo>>& applyList, int begin, int limit) {

	return _dao.GetApplyList(touid, applyList, begin, limit);
}

bool MysqlMgr::GetFriendList(int self_id, std::vector<std::shared_ptr<UserInfo> >& user_info) {
	return _dao.GetFriendList(self_id, user_info);
}

bool MysqlMgr::SaveChatMsgs(const std::vector<ChatMsgInfo>& msgs) {
	return _dao.SaveChatMsgs(msgs);
}

bool MysqlMgr::GetChatMsgList(const std::string& session_id, long long last_id, int limit,
	std::vector<std::shared_ptr<ChatMsgInfo>>& msg_list) {
	return _dao.GetChatMsgList(session_id, last_id, limit, msg_list);
}

long long MysqlMgr::CreateGroup(const std::string& name, int owner_uid, const std::vector<int>& members) {
	return _dao.CreateGroup(name, owner_uid, members);
}

bool MysqlMgr::GetUserGroups(int uid, std::vector<std::shared_ptr<GroupInfo>>& groups) {
	return _dao.GetUserGroups(uid, groups);
}

bool MysqlMgr::GetGroupMembers(long long group_id, std::vector<int>& uids) {
	return _dao.GetGroupMembers(group_id, uids);
}

bool MysqlMgr::IsGroupMember(long long group_id, int uid) {
	return _dao.IsGroupMember(group_id, uid);
}

