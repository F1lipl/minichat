#include "VerifyGrpcClinet.h"

RPConPool::RPConPool(size_t poolsize, std::string host, std::string port):poolsize_(poolsize),	host_(host),port_(port)
{
	for (size_t i = 0;i < poolsize;++i) {
		// 直接使用 CreateChannel 的返回值（std::shared_ptr<grpc::Channel>）
		auto channel = grpc::CreateChannel(host + ":" + port, grpc::InsecureChannelCredentials());
		connections_.push(VarifyService::NewStub(channel));
	}
}

RPConPool::~RPConPool()
{
	std::lock_guard<std::mutex>lock(mutex_);
	close();
	while (!connections_.empty()) {
		connections_.pop();
	}
}

void RPConPool::close() {
	b_stop_ = true;
	cond_.notify_all();
}

std::unique_ptr<VarifyService::Stub> RPConPool::Getconnection()
{
	std::unique_lock<std::mutex>lock(mutex_);
	cond_.wait(lock, [this]() {
		if (this->b_stop_)return true;
		return !connections_.empty();
	});
	if (b_stop_)return nullptr;
	auto context = std::move(connections_.front());
	connections_.pop();
	return std::move(context); // 明确移动返回
}

void RPConPool::returnConnection(std::unique_ptr<VarifyService::Stub> ptr)
{
	std::lock_guard<std::mutex>lock(mutex_);
	if (b_stop_)return;
	connections_.push(std::move(ptr)); // 必须移动
	cond_.notify_one();
	return;
}