#pragma 
#include<grpcpp/grpcpp.h>
#include"message.grpc.pb.h"
#include"const.h"
#include"Singleton.h"
#include"ConfigMgr.h"

using grpc::Channel;//channel会加入到stub里，grpc通过channel跟服务器通信
using grpc::Status;//状态
using grpc::ClientContext;//上下文

using message::GetVarifyReq;//	请求
using message::GetVarifyRsp;//回应
using message::VarifyService;//服务

class RPConPool 
{
public:
	RPConPool(size_t poolsize, std::string host, std::string port);
	~RPConPool();
	void close();
	std::unique_ptr<VarifyService::Stub> Getconnection();
	void returnConnection(std::unique_ptr<VarifyService::Stub>);
private:
	std::atomic<bool> b_stop_;//标记是否停止
	size_t poolsize_;
	std::string port_;
	std::string host_;
	std::queue<std::unique_ptr<VarifyService::Stub>>connections_;
	std::mutex mutex_;
	std::condition_variable cond_;//这是一个生产者和消费者场景，当有空闲stub时，消费者去争抢使用，当没有时阻塞，所以归还stub时就要唤醒一个等待的线程
};







class VerifyGrpcClinet:public Singleton<VerifyGrpcClinet>
{
	friend class Singleton<VerifyGrpcClinet>;
public:
	GetVarifyRsp GetvarifyCode(std::string email) {
		ClientContext context;
		GetVarifyRsp reply;
		GetVarifyReq request;
		request.set_email(email);
		auto stub = pool_->Getconnection();
		Status status = stub->GetVarifyCode(&context, request, &reply);
		if (status.ok()) {
			pool_->returnConnection(std::move(stub));
			return reply;
		}
		else {
			pool_->returnConnection(std::move(stub));
			reply.set_error(ErrorCodes::RPCFailed);
			return reply;
		}
	}
private:
	VerifyGrpcClinet() {
		auto& gCfgMgr = ConfigMgr::Inst();
		std::string host = gCfgMgr["VarifyServer"]["Host"];
		std::string port = gCfgMgr["VarifyServer"]["Port"];
		pool_.reset(new RPConPool(5, host, port));
		
	}
	std::unique_ptr<VarifyService::Stub>stub_;//信使
	std::unique_ptr<RPConPool> pool_;
	//修改构造函数

};

