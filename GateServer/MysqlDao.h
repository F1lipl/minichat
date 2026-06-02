#pragma once
#include"const.h"
#include<thread>


class SqlConnection {
public:
	SqlConnection(sql::Connection* con, int64_t lasttime) :con_(con), lasttime_(lasttime) {}
	std::unique_ptr<sql::Connection>con_;
	int64_t lasttime_;
};
class MysqlPool {
public:
	MysqlPool(std::string url, std::string user, std::string pass, std::string schem, int poolsize) :url_(url),user_(user),pass_(pass),
	schema_(schem),poolSize_(poolsize),b_stop_(false),fail_count_(0)
	{
		try {
			for (int i = 0;i < poolSize_;++i) {
				sql::mysql::MySQL_Driver* driver = sql::mysql::get_driver_instance();
				auto* con = driver->connect(url_, user_, pass_);
				con->setSchema(schema_);
				//获取当前时间戳
				auto currenttime = std::chrono::system_clock::now().time_since_epoch();
				//将时间戳转换成秒
				long long timestamp = std::chrono::duration_cast<std::chrono::seconds>(currenttime).count();
				pool_.push(std::make_unique<SqlConnection>(con, timestamp));
				/*auto* connect = &SqlConnection(con, timestamp);
				std::unique_ptr<SqlConnection>cnn(connect);
				pool_.push(cnn);*/
			}
			check_thread_ = std::thread([this] {
				while (!b_stop_) {
					CheckConnectionPro();
					std::this_thread::sleep_for(std::chrono::seconds(60));
				}
				});
			check_thread_.detach();
		}
		catch (sql::SQLException& e) {
			// 处理异常
			std::cout << "mysql pool init failed, error is " << e.what() << std::endl;
		}
	}
	void CheckConnectionPro();
	bool  reconnect(int64_t timestamp);
	std::unique_ptr<SqlConnection> getConnection();
	void ReturnConnection(std::unique_ptr<SqlConnection>con);
	void close() {
		b_stop_ = true;
		cond_.notify_all();
	}
	~MysqlPool() {
		std::lock_guard<std::mutex>lock(mutex_);
		while (!pool_.empty())pool_.pop();
	}
private:
	std::string url_;
	std::string user_;
	std::string pass_;
	std::string schema_;
	int poolSize_;
	std::queue<std::unique_ptr<SqlConnection>> pool_;
	std::mutex mutex_;
	std::condition_variable cond_;
	std::atomic<bool> b_stop_;
	std::thread check_thread_;
	std::atomic<int> fail_count_;
};

struct UserInfo
{
	std::string name;
	std::string pwd;
	int uid;
	std::string email;
};

class MysqlDao {
public:
	MysqlDao();
	~MysqlDao();
	int RegUser(const std::string& name, const std::string& email, const std::string& pwd);
	int RegUserTransaction(const std::string& name, const std::string& email, const std::string& pwd, const std::string& icon);
	bool CheckEmail(const std::string& name, const std::string& email);
	bool UpdatePwd(const std::string& name, const std::string& newpwd);
	bool CheckPwd(const std::string& name, const std::string& pwd, UserInfo& userInfo);
	bool TestProcedure(const std::string& email, int& uid, std::string& name);




private:
	std::unique_ptr<MysqlPool>pool_;
};