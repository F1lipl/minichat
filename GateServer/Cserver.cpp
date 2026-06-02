#pragma once
#include"Cserver.h"
#include"HttpConnection.h"
#include"AsioIOServicePool.h"
#include"const.h"
Cserver::Cserver(net::io_context& ioc, unsigned short& port) :ioc_(ioc), acceptor_(ioc, tcp::endpoint(tcp::v4(), port)) {
};


void Cserver::start() {
	auto self = shared_from_this();//因为是异步调用，用shared_ptr进行伪闭包，防止在回调前析构；
	auto& service = AsioIOServicePool::GetInstance()->GetIOService();
	auto ptr = std::make_shared<HttpConnection>(service);
	acceptor_.async_accept(ptr->getsocket(), [self,ptr](beast::error_code ec) {
		try
		{
			if (ec) {//如果出错，放弃链接；
				self->start();
				return;
			}
			//创建一个新的连接管理；
			ptr->start();
			self->start();
		}
		catch (const std::exception& ex)
		{
			std::cout << "find exception is" << ex.what()<< std::endl;
		}




		});
}