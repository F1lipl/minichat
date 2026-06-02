#pragma once
#include<boost/asio.hpp>
#include<vector>
#include<thread>
#include"const.h"
#include"Singleton.h"
class AsioIOServicePool:public Singleton<AsioIOServicePool>
{
	friend class Singleton<AsioIOServicePool>;
public:
	using IOService = boost::asio::io_context;
	using Work = boost::asio::executor_work_guard<boost::asio::io_context::executor_type>;
	using WorkPtr = std::unique_ptr<Work>;
	~AsioIOServicePool();
	IOService& GetIOService();
	void Stop();




private:
	AsioIOServicePool(std::size_t size = 0);
	std::vector<IOService>io_content_;
	std::vector<WorkPtr>workers_;
	std::vector<std::thread>threads_;
	std::size_t  NextIOservice;
};

