#pragma once
#include "const.h"
#include "Singleton.h"
#include "ConfigMgr.h"
#include <grpcpp/grpcpp.h> 
#include "message.grpc.pb.h"
#include "message.pb.h"
#include<atomic>

using grpc::Channel;
using grpc::Status;
using grpc::ClientContext;

using message::GetChatServerReq;
using message::GetChatServerRsp;
using message::LoginRsp;
using message::LoginReq;
using message::StatusService;



class StatusConPool {
public:
	StatusConPool(std::string host, std::string port, size_t poolsize) :host_(host), port_(port), b_stop_(false),poolSize_(poolsize) {
		for (size_t i = 0;i < poolSize_;++i) {
			std::shared_ptr<Channel> channel = grpc::CreateChannel(host + ":" + port,grpc::InsecureChannelCredentials());
			pool_.push(StatusService::NewStub(channel));
		}
	}
	~StatusConPool() {
		std::lock_guard<std::mutex> lock(mutex_);
		Close();
		while (!pool_.empty()) {
			pool_.pop();
		}
	}
	void Close() {
		b_stop_ = true;
		cond_.notify_all();
	}
	std::unique_ptr<StatusService::Stub> GetConnection() {
		std::unique_lock<std::mutex>lock(mutex_);
		cond_.wait(lock, [this]() {
			if (b_stop_)return true;
			return !pool_.empty();
			});
		if (b_stop_)return nullptr;
		auto ptr = std::move(pool_.front());
		pool_.pop();
		return std::move(ptr);
	}
	void ReturnConnection(std::unique_ptr<StatusService::Stub>connection) {
		std::lock_guard<std::mutex>lock(mutex_);
		if (b_stop_)return;
		pool_.push(std::move(connection));
		cond_.notify_one();
	}



private:
	std::queue<std::unique_ptr<StatusService::Stub>>pool_;
	std::mutex mutex_;
	std::atomic<bool> b_stop_;
	std::condition_variable cond_;
	std::string port_;
	std::string host_;
	size_t poolSize_;
};

class StatusGrpcClient:public Singleton<StatusGrpcClient> {
	friend class Singleton<StatusGrpcClient>;
public:
	~StatusGrpcClient() {}
	GetChatServerRsp GetChatServer(int uid);
	LoginRsp Login(int uid, std::string token);



private:
	StatusGrpcClient();
	std::unique_ptr<StatusConPool>pool_;
};