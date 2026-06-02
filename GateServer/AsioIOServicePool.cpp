#include "AsioIOServicePool.h"
#include"const.h"
#include<iostream>
AsioIOServicePool::AsioIOServicePool(std::size_t size) :NextIOservice(0),io_content_(size), workers_(size) {
	for (std::size_t i = 0;i < size;++i) {
		workers_[i] = std::unique_ptr<Work>(new Work(io_content_[i].get_executor()));
	}
	for (std::size_t i = 0;i < io_content_.size();++i) {
		threads_.emplace_back([i, this]() {
			this->io_content_[i].run();
			});

	}
}

AsioIOServicePool::IOService&  AsioIOServicePool::GetIOService() {
	if (NextIOservice < io_content_.size()) {
		auto& service = io_content_[NextIOservice++];
		return service;
	}
	NextIOservice = 0;
	auto& service = io_content_[0];
	return service;
}


void AsioIOServicePool::Stop() {
	for (std::size_t i = 0;i < workers_.size();++i) {
		workers_[i]->reset();
	}
	for (auto& i : threads_) {
		i.join();
	}
}

AsioIOServicePool::~AsioIOServicePool() {
	Stop();
	std::cout << "AsioIOServicePool destruct" << std::endl;
}