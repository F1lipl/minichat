#include "Cserver.h"
#include"const.h"
#include"AsioIOServicePool.h"
#include"CSession.h"
#include"UserMgr.h"
CServer::CServer(boost::asio::io_context& io_context, short port) :_io_context(io_context), _port(port),
_acceptor(io_context, tcp::endpoint(tcp::v4(), port))
{
    std::cout << "Server start success, listen on port : " << _port <<std:: endl;
    StartAccept();
}

CServer::~CServer()
{
    std::cout << "Cserver destruct on port" << _port << std::endl;
}

void CServer::ClearSession(std::string session_id) {

    if (_sessions.find(session_id) != _sessions.end()) {
        //移除用户和session的关联
        UserMgr::GetInstance()->RmvUserSession(_sessions[session_id]->GetUserId(),session_id);
    }

    {
        lock_guard<mutex> lock(_mutex);
        _sessions.erase(session_id);
    }

}

void CServer::HandleAccept(shared_ptr<CSession>new_session, const boost::system::error_code& error)
{
    if (!error) {
        new_session->Start();
        lock_guard<mutex> lock(_mutex);
        _sessions.insert(make_pair(new_session->GetUuid(), new_session));
    }
    else {
        cout << "session accept failed, error is " << error.what() << endl;
    }
    StartAccept();
}

void CServer::StartAccept()
{
    auto& io_content = AsioIOServicePool::GetInstance()->GetIOService();
    std::shared_ptr<CSession>new_session = std::make_shared<CSession>(io_content, this);
    _acceptor.async_accept(new_session->GetSocket(), std::bind(&CServer::HandleAccept, this, new_session, std::placeholders::_1));
}

