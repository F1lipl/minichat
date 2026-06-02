#include "ChatServiceImpl.h"
#include "CSession.h"
#include <json/json.h>
#include <json/value.h>
#include <json/reader.h>
#include "RedisMgr.h"
#include "MysqlMgr.h"
#include "UserMgr.h"
#include "UserData.h"
#include "ChatGrpcClient.h"

namespace {
	std::string OfflineMsgKey(int uid) {
		return std::string(OFFLINE_MSG_PREFIX) + std::to_string(uid);
	}

	Json::Value BuildTextNotifyValue(const TextChatMsgReq* request) {
		Json::Value rtvalue;
		rtvalue["error"] = ErrorCodes::Success;
		rtvalue["fromuid"] = request->fromuid();
		rtvalue["touid"] = request->touid();
		Json::Value text_array(Json::arrayValue);
		for (auto& msg : request->textmsgs()) {
			Json::Value element;
			element["content"] = msg.msgcontent();
			element["msgid"] = msg.msgid();
			text_array.append(element);
		}
		rtvalue["text_array"] = text_array;
		return rtvalue;
	}

	void SaveOfflineTextMsg(const Json::Value& rtvalue) {
		RedisMgr::GetInstance()->RPush(OfflineMsgKey(rtvalue["touid"].asInt()), rtvalue.toStyledString());
	}
}

ChatServiceImpl::ChatServiceImpl()
{
}

Status ChatServiceImpl::NotifyAddFriend(ServerContext* context, const AddFriendReq* request, AddFriendRsp* reply)
{
	auto touid = request->touid();
	auto sessions = UserMgr::GetInstance()->GetSessions(touid);
	Defer defer([request, reply]() {
		reply->set_error(ErrorCodes::Success);
		reply->set_applyuid(request->applyuid());
		reply->set_touid(request->touid());
		});

	if (sessions.empty()) {
		return Status::OK;
	}

	Json::Value rtvalue;
	rtvalue["error"] = ErrorCodes::Success;
	rtvalue["applyuid"] = request->applyuid();
	rtvalue["name"] = request->name();
	rtvalue["desc"] = request->desc();
	rtvalue["icon"] = request->icon();
	rtvalue["nick"] = request->nick();
	rtvalue["sex"] = request->sex();

	std::string return_str = rtvalue.toStyledString();
	for (auto& session : sessions) {
	if (session) {
		session->Send(return_str, ID_NOTIFY_ADD_FRIEND_REQ);
	}
}
	return Status::OK;
}

Status ChatServiceImpl::NotifyAuthFriend(ServerContext* context, const AuthFriendReq* request, AuthFriendRsp* reply)
{
	auto touid = request->touid();
	auto sessions = UserMgr::GetInstance()->GetSessions(touid);
	reply->set_error(ErrorCodes::Success);
	reply->set_fromuid(request->fromuid());
	reply->set_touid(request->touid());

	if (sessions.empty()) {
		return Status::OK;
	}

	Json::Value rtvalue;
	rtvalue["error"] = ErrorCodes::Success;
	rtvalue["fromuid"] = request->fromuid();
	rtvalue["touid"] = request->touid();

	std::string base_key = USER_BASE_INFO + std::to_string(request->fromuid());
	auto user_info = std::make_shared<UserInfo>();
	bool b_info = GetBaseInfo(base_key, request->fromuid(), user_info);
	if (b_info) {
		rtvalue["name"] = user_info->name;
		rtvalue["nick"] = user_info->nick;
		rtvalue["icon"] = user_info->icon;
		rtvalue["sex"] = user_info->sex;
	}
	else {
		rtvalue["error"] = ErrorCodes::UidInvalid;
	}

	std::string return_str = rtvalue.toStyledString();
	for (auto& session : sessions) {
	if (session) {
		session->Send(return_str, ID_NOTIFY_AUTH_FRIEND_REQ);
	}
}
	return Status::OK;
}

Status ChatServiceImpl::NotifyTextChatMsg(::grpc::ServerContext* context, const TextChatMsgReq* request, TextChatMsgRsp* reply)
{
	auto touid = request->touid();
	auto sessions = UserMgr::GetInstance()->GetSessions(touid);
	reply->set_error(ErrorCodes::Success);
	reply->set_fromuid(request->fromuid());
	reply->set_touid(request->touid());

	Json::Value rtvalue = BuildTextNotifyValue(request);
	for (auto& msg : request->textmsgs()) {
		auto* text_msg = reply->add_textmsgs();
		text_msg->set_msgid(msg.msgid());
		text_msg->set_msgcontent(msg.msgcontent());
	}

	if (sessions.empty()) {
		reply->set_error(ErrorCodes::UidInvalid);
		return Status::OK;
	}

	std::string return_str = rtvalue.toStyledString();
	for (auto& session : sessions) {
	if (session) {
		session->Send(return_str, ID_NOTIFY_TEXT_CHAT_MSG_REQ);
	}
}
	return Status::OK;
}

bool ChatServiceImpl::GetBaseInfo(std::string base_key, int uid, std::shared_ptr<UserInfo>& userinfo)
{
	std::string info_str = "";
	bool b_base = RedisMgr::GetInstance()->Get(base_key, info_str);
	if (b_base) {
		Json::Reader reader;
		Json::Value root;
		reader.parse(info_str, root);
		userinfo->uid = root["uid"].asInt();
		userinfo->name = root["name"].asString();
		userinfo->pwd = root["pwd"].asString();
		userinfo->email = root["email"].asString();
		userinfo->nick = root["nick"].asString();
		userinfo->desc = root["desc"].asString();
		userinfo->sex = root["sex"].asInt();
		userinfo->icon = root["icon"].asString();
	}
	else {
		std::shared_ptr<UserInfo> user_info = MysqlMgr::GetInstance()->GetUser(uid);
		if (user_info == nullptr) {
			return false;
		}

		userinfo = user_info;
		Json::Value redis_root;
		redis_root["uid"] = uid;
		redis_root["pwd"] = userinfo->pwd;
		redis_root["name"] = userinfo->name;
		redis_root["email"] = userinfo->email;
		redis_root["nick"] = userinfo->nick;
		redis_root["desc"] = userinfo->desc;
		redis_root["sex"] = userinfo->sex;
		redis_root["icon"] = userinfo->icon;
		RedisMgr::GetInstance()->Set(base_key, redis_root.toStyledString());
	}

	return true;
}

void ChatServiceImpl::RegisterServer(std::shared_ptr<CServer> pServer)
{
	_p_server = pServer;
}

