#include "ChatGrpcClient.h"


std::unique_ptr<ChatService::Stub> ChatConPool::GetConnection()
{
	std::unique_lock<std::mutex>lock(mutex_);
	cond_.wait(lock, [this]() {
		if (b_stop_)return true;
		return !connections_.empty();
		});
	if (b_stop_)return nullptr;
	auto connect = std::move(connections_.front());
	connections_.pop();
	return std::move(connect);
}
void ChatConPool::ReturnConnection(std::unique_ptr<ChatService::Stub>connect) {
	std::lock_guard<std::mutex>lock(mutex_);
	if (b_stop_)return;
	connections_.push(std::move(connect));
	cond_.notify_one();
}
void ChatConPool::close() {
	b_stop_ = true;
	cond_.notify_all();
}