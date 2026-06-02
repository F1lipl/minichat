#include "StatusGrpcClient.h"



StatusGrpcClient::StatusGrpcClient() {
    auto& gCfgMgr = ConfigMgr::Inst();
    std::string host = gCfgMgr["StatusServer"]["Host"];
    std::string port = gCfgMgr["StatusServer"]["Port"];
    pool_.reset(new StatusConPool(host, port, 5));
}

GetChatServerRsp StatusGrpcClient::GetChatServer(int uid)
{
    ClientContext context;
    GetChatServerReq request;
    GetChatServerRsp response;
    auto stub = pool_->GetConnection();
    request.set_uid(uid);
    Status statu = stub->GetChatServer(&context, request, &response);
    Defer defer([this, &stub]() {
        pool_->ReturnConnection(std::move(stub));
        });
    if (statu.ok())return response;
    else {
        response.set_error(ErrorCodes::RPCFailed);
        return response;
    }
}

LoginRsp StatusGrpcClient::Login(int uid, std::string token)
{
    ClientContext context;
    LoginReq request;
    LoginRsp response;
    request.set_uid(uid);
    request.set_token(token);
    auto stub = pool_->GetConnection();
    Defer defer([this, &stub] {
        pool_->ReturnConnection(std::move(stub));
        });
    auto status = stub->Login(&context, request, &response);
    if (status.ok())return response;
    else {
        response.set_error(ErrorCodes::RPCFailed);
        return response;
    }
}
