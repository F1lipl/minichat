#pragma once
#include"const.h"


class Cserver :public std::enable_shared_from_this<Cserver>{
public:
	Cserver(net::io_context& ioc,unsigned short& port);
	void start();
private:
	tcp::acceptor acceptor_;
	net::io_context & ioc_;

};
