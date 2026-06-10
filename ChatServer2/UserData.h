#pragma once
#pragma once
#include <string>
struct UserInfo {
	UserInfo() :name(""), pwd(""), uid(0), email(""), nick(""), desc(""), sex(0), icon(""), back("") {}
	std::string name;
	std::string pwd;
	int uid;
	std::string email;
	std::string nick;
	std::string desc;
	int sex;
	std::string icon;
	std::string back;
};

struct ApplyInfo {
	ApplyInfo(int uid, std::string name, std::string desc,
		std::string icon, std::string nick, int sex, int status)
		:_uid(uid), _name(name), _desc(desc),
		_icon(icon), _nick(nick), _sex(sex), _status(status) {
	}

	int _uid;
	std::string _name;
	std::string _desc;
	std::string _icon;
	std::string _nick;
	int _sex;
	int _status;
};

// A chat group summary, returned in the group list.
struct GroupInfo {
	GroupInfo() : group_id(0), owner_uid(0), member_count(0) {}
	long long group_id;
	std::string name;
	int owner_uid;
	int member_count;
};

// A single persisted chat message (used for both async persistence and history query).
struct ChatMsgInfo {
	ChatMsgInfo() : msg_id(0), from_uid(0), to_uid(0), status(0) {}
	long long msg_id;            // global ordered id, assigned by MySQL auto_increment
	std::string session_id;      // 1-1 session key: minUid_maxUid
	int from_uid;
	int to_uid;
	std::string unique_id;       // client-generated msg id, used for dedup
	std::string content;
	int status;                  // 0 sent, 1 read (reserved)
	std::string create_time;     // filled on read back from DB
};