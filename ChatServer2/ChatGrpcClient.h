#pragma once
#include"const.h"
#include "Singleton.h"
#include "ConfigMgr.h"
#include <grpcpp/grpcpp.h> 
#include "message.grpc.pb.h"
#include "message.pb.h"
#include"UserData.h"
#include<atomic>
using grpc::Channel;
using grpc::Status;
using grpc::ClientContext;

using message::AddFriendReq;
using message::AddFriendRsp;

using message::AuthFriendReq;
using message::AuthFriendRsp;

using message::GetChatServerRsp;
using message::LoginRsp;
using message::LoginReq;
using message::ChatService;

using message::TextChatMsgReq;
using message::TextChatMsgRsp;
using message::TextChatData;


class ChatConPool :public Singleton<ChatConPool>
{
	friend class Singleton<ChatConPool>;
public:
	ChatConPool(size_t poolSize, std::string host, std::string port) :poolSize_(poolSize), host_(host), port_(port), b_stop_(false) {
		for (int i = 0;i < poolSize_;++i) {
			std::shared_ptr<grpc::Channel>channel = grpc::CreateChannel(host + ":" + port, grpc::InsecureChannelCredentials());
			connections_.push(std::move(ChatService::NewStub(channel)));
		}
	}
	std::unique_ptr<ChatService::Stub> GetConnection();
	void ReturnConnection(std::unique_ptr<ChatService::Stub>);
	void close();
	~ChatConPool() {
		std::lock_guard<std::mutex>lock(mutex_);
		close();
		while (!connections_.empty()) {
			connections_.pop();
		}
	}
private:
	std::condition_variable cond_;
	std::mutex mutex_;
	std::queue<std::unique_ptr<ChatService::Stub>>connections_;
	std::atomic<bool> b_stop_;
	size_t poolSize_;
	std::string host_;
	std::string port_;


};


class ChatGrpcClient :public Singleton<ChatGrpcClient>
{
	friend class Singleton<ChatGrpcClient>;
public:
	~ChatGrpcClient() {
	}

	AddFriendRsp NotifyAddFriend(std::string server_ip, const AddFriendReq& req);
	AuthFriendRsp NotifyAuthFriend(std::string server_ip, const AuthFriendReq& req);
	bool GetBaseInfo(std::string base_key, int uid, std::shared_ptr<UserInfo>& userinfo);
	TextChatMsgRsp NotifyTextChatMsg(std::string server_ip, const TextChatMsgReq& req, const Json::Value& rtvalue);
	/*KickUserRsp NotifyKickUser(std::string server_ip, const KickUserReq& req);*/
private:
	ChatGrpcClient();
	std::unordered_map<std::string, std::unique_ptr<ChatConPool>> _pools;
};