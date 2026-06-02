//#pragma once
//#include<iostream>
//#include"const.h"
//
//
//class ThreadPool {
//
//public:
//	ThreadPool() {};
//	~ThreadPool() {
//		stop();
//	};
//
//	template<typename F,typename ...Args>
//	auto exec(F&& func, Args&&... args) {
//		using ResultType = decltype(func(args...));//类型推导
//		std::share_ptr ptr = std::make_shared<std::packaged_task<ResultType()>>(std::bind(std::forward<F>func, std::forward<Args>(args...)));
//		auto workptr = std::make_unique<std::function<void()>>([ptr]() {
//			(*ptr)();
//			});
//		{
//			std::lock_guard<std::mutex>lock(mutex_);
//			queue_.push(std::move(workptr));
//			cond_.notify_one();
//		}
//		return ptr->get_future();
//	}
//	void init(int cont) {
//		count_ = cont;
//		b_stop_ = false;
//		for (int i = 0;i < cont;++i) {
//			thread_.emplace_back([this]() {
//				work();
//				});
//		}
//	}
//
//	void stop() {
//		{
//			std::lock_guard<std::mutex> lock(mutex_);
//			if (b_stop_) return; // 避免重复调用
//			b_stop_ = true;
//		}
//		cond_.notify_all(); // 唤醒所有等待线程
//		for (std::thread& worker : thread_) {
//			if (worker.joinable()) {
//				worker.join(); // 等待所有线程结束
//			}
//		}
//		thread_.clear();
//		// 可以选择清空队列 queue_ = std::queue<...>();
//	}
//private:
//	void work() {
//		while (true) {
//			std::unique_lock<std::mutex>lock(mutex_);
//			cond_.wait(lock, [this]() {
//				return b_stop_ || !queue_.empty(); // 唤醒条件：停止信号 或 队列非空
//				});
//
//			if (b_stop_&&!queue_.empty()) {
//				while (!queue_.empty()) {
//					auto workptr = std::move(queue_.front());
//					queue_.pop();
//					(*workptr)();
//					return;
//				}
//			}
//			else if (b_stop_ && queue_.empty())return;
//			else {
//				auto workptr = std::move(queue_.front());
//				(*workptr)();
//			}
//		}
//	
//	
//	
//	}
//	int count_;
//	std::vector<std::thread> thread_;
//	std::condition_variable cond_;
//	std::mutex mutex_;
//	std::queue <std::unique_ptr<std::function<void()>>>queue_;
//	std::atomic<bool>b_stop_;
//};