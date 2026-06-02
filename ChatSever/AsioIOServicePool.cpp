#include "AsioIOServicePool.h"
#include"const.h"
#include<iostream>
#include<algorithm>
#include<cstdlib>

namespace {
	std::size_t ReadSizeEnv(const char* name, std::size_t default_value, std::size_t max_value) {
		char value[32] = {};
		size_t required = 0;
		if (getenv_s(&required, value, sizeof(value), name) == 0 && required > 1) {
			auto parsed = static_cast<std::size_t>(std::atoi(value));
			if (parsed > 0) {
				return std::min(parsed, max_value);
			}
		}
		return default_value;
	}

	std::size_t ResolveIOThreadCount(std::size_t requested) {
		if (requested > 0) {
			return requested;
		}
		return ReadSizeEnv("MINICHAT_IO_THREADS", 2, 32);
	}
}

AsioIOServicePool::AsioIOServicePool(std::size_t size)
	: NextIOservice(0), io_content_(ResolveIOThreadCount(size)), workers_(io_content_.size()) {
	for (std::size_t i = 0;i < io_content_.size();++i) {
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
