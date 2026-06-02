#pragma once 
#include"const.h"


class Logicsystem;
class HttpConnection :public std::enable_shared_from_this<HttpConnection> {
	friend class LogicSystem;
public:
	HttpConnection(boost::asio::io_context& ioc);
	void start();
	tcp::socket& getsocket() {
		return socket_;
	}
private:
	void CheckDeadline();
	void HandleReq();
	void WriteResponse();
	void PreParseGetParam();
	tcp::socket socket_;
	std::string get_url_;
	beast::flat_buffer buffer_{ 8192 };//buffer
	http::request<http::dynamic_body> request_;//请求
	http::response<http::dynamic_body> response_;//回复
	net::steady_timer deadline_{//定时器
		socket_.get_executor(),std::chrono::seconds(60)
	};
	std::unordered_map<std::string, std::string>get_pragma_;
};