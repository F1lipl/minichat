#include "RedisMgr.h"
#include "ConfigMgr.h"
#include"const.h"
#include <iostream>
#include <iterator>
#include <algorithm>
#include <cstdlib>

namespace {
	size_t ReadSizeEnv(const char* name, size_t default_value, size_t max_value) {
		char value[32] = {};
		size_t required = 0;
		if (getenv_s(&required, value, sizeof(value), name) == 0 && required > 1) {
			auto parsed = static_cast<size_t>(std::atoi(value));
			if (parsed > 0) {
				return std::min(parsed, max_value);
			}
		}
		return default_value;
	}
}

RedisMgr::RedisMgr() {
	auto& gCfgMgr = ConfigMgr::Inst();
	auto host = gCfgMgr["Redis"]["Host"];
	auto port_str = gCfgMgr["Redis"]["Port"];
	auto password = gCfgMgr["Redis"]["Passwd"];
	if (password.empty()) password = gCfgMgr["Redis"]["Password"];

	if (host.empty()) host = "127.0.0.1";
	int port = 6379;
	if (!port_str.empty()) {
		try { port = std::stoi(port_str); }
		catch (...) {}
	}

	std::cout << "Redis config read: host=" << host << " port=" << port << " passwd=" << (password.empty() ? "<empty>" : "<set>") << std::endl;

	sw::redis::ConnectionOptions conn_opt;
	conn_opt.host = host;
	conn_opt.port = port;
	if (!password.empty()) conn_opt.password = password;
	conn_opt.connect_timeout = std::chrono::seconds(3);
	conn_opt.socket_timeout = std::chrono::seconds(10);
	sw::redis::ConnectionPoolOptions pool_opt;
	pool_opt.size = ReadSizeEnv("MINICHAT_REDIS_POOL_SIZE", 16, 64);

	try {
		redis_.reset(new sw::redis::Redis(conn_opt, pool_opt));
		std::cout << "Connected to Redis " << conn_opt.host << ":" << conn_opt.port << std::endl;
	}
	catch (const std::exception& e) {
		std::cerr << "Redis connect failed: " << e.what() << std::endl;
		throw;
	}
}

RedisMgr::~RedisMgr()
{
	close_connect();
}

bool RedisMgr::Get(const std::string& key, std::string& value)
{
	auto val = redis_->get(key);
	if (val) {
		std::cout << "Succeed to execute command [ GET " << key << "  ]" << std::endl;
		value = *val;
		return true;
	}
	std::cout << "[ GET  " << key << " ] failed" << std::endl;
	return false;
}

bool RedisMgr::Set(const std::string& key, const std::string& value)
{
	bool i=redis_->set(key, value);
	if (i) {
		std::cout << "Execut command [ SET " << key << "  " << value << " ] failure ! " << std::endl;
	}
	else {
		std::cout << "Execut command [ SET " << key << "  " << value << " ] success ! " << std::endl;
	}
	return i;
}

bool RedisMgr::Auth(const std::string& password)
{
	redis_->auth(password);
	return true;
}

bool RedisMgr::LPush(const std::string& key, const std::string& value)
{
	auto i=redis_->lpush(key, value);
	if (i > 0) {
		std::cout << "Execut command [ LPUSH " << key << "  " << value << " ] success ! " << std::endl;
		return true;
	}
	else {
		std::cout << "Execut command [ LPUSH " << key << "  " << value << " ] failure ! " << std::endl;
		return false;
		
	}
}

bool RedisMgr::LPop(const std::string& key, std::string& value)
{
	auto val = redis_->lpop(key);
	if (val) {
		std::cout << "Execut command [ LPOP " << key << " ] success ! " << std::endl;
		value = *val;
		return true;
	}
	else {
		std::cout << "Execut command [ LPOP " << key << " ] failure ! " << std::endl;
		return false;
	}
}

bool RedisMgr::RPush(const std::string& key, const std::string& value)
{
	auto i=redis_->rpush(key, value);
	if (i > 0) {
		std::cout << "Execut command [ RPUSH " << key << "  " << value << " ] failure ! " << std::endl;
		return true;
	}
	else {
		std::cout << "Execut command [ RPUSH " << key << "  " << value << " ] failure ! " << std::endl;
		return false;
	}
}

bool RedisMgr::RPop(const std::string& key, std::string& value)
{
	auto i = redis_->rpop(key);
	if (i) {
		std::cout << "Execut command [ RPOP " << key << " ] success ! " << std::endl;
		value = *i;
		return true;
	}
	else {
		std::cout << "Execut command [ RPOP " << key << " ] failure ! " << std::endl;
		return false;
	}
}

bool RedisMgr::SAdd(const std::string& key, const std::string& member)
{
	try {
		redis_->sadd(key, member);
		std::cout << "Execut command [ SADD " << key << " " << member << " ] success ! " << std::endl;
		return true;
	}
	catch (const sw::redis::Error& e) {
		std::cerr << "Execute command [ SADD " << key << " " << member << " ] failure! Error: " << e.what() << std::endl;
		return false;
	}
}

bool RedisMgr::SRem(const std::string& key, const std::string& member)
{
	try {
		redis_->srem(key, member);
		std::cout << "Execut command [ SREM " << key << " " << member << " ] success ! " << std::endl;
		return true;
	}
	catch (const sw::redis::Error& e) {
		std::cerr << "Execute command [ SREM " << key << " " << member << " ] failure! Error: " << e.what() << std::endl;
		return false;
	}
}

std::vector<std::string> RedisMgr::SMembers(const std::string& key)
{
	std::vector<std::string> members;
	try {
		redis_->smembers(key, std::back_inserter(members));
		std::cout << "Execut command [ SMEMBERS " << key << " ] success ! " << std::endl;
	}
	catch (const sw::redis::Error& e) {
		std::cerr << "Execute command [ SMEMBERS " << key << " ] failure! Error: " << e.what() << std::endl;
	}
	return members;
}
bool RedisMgr::HSet(const std::string& key, const std::string& hkey, const std::string& value)
{
	long long i=redis_->hset(key, hkey,value);
	if (i) {
		std::cout << "Execut command [ HSet " << key << "  " << hkey << "  " << value << " ] success ! " << std::endl;
		return true;
	}
	else {
		std::cout << "Execut command [ HSet " << key << "  " << hkey << "  " << value << " ] failure ! " << std::endl;
		return false;
	}
}

bool RedisMgr::HSet(const char* key, const char* hkey, const char* hvalue, size_t hvaluelen) {
	try {
		// 使用二进制安全的方式设置哈希字段
		redis_->hset(
			std::string(key),
			std::string(hkey, hkey ? strlen(hkey) : 0),
			std::string(hvalue, hvaluelen)
		);

		// 打印成功日志（可选）
		std::cout << "Execute command [ HSet " << key << " " << hkey
			<< " " << std::string(hvalue, std::min(hvaluelen, static_cast<size_t>(10)))
			<< (hvaluelen > 10 ? "..." : "") << " ] success!" << std::endl;
		return true;
	}
	catch (const sw::redis::Error& e) {
		// 打印错误日志
		std::cerr << "Execute command [ HSet " << key << " " << hkey
			<< " " << std::string(hvalue, std::min(hvaluelen, static_cast<size_t>(10)))
			<< (hvaluelen > 10 ? "..." : "") << " ] failure: "
			<< e.what() << std::endl;
		return false;
	}
}

std::string RedisMgr::HGet(const std::string& key, const std::string& hkey) {
	try {
		// 使用redis++的hget方法
		auto value = redis_->hget(key, hkey);

		if (!value) {
			// 字段不存在的情况
			std::cout << "Execute command [ HGet " << key << " " << hkey
				<< " ]: field not found!" << std::endl;
			return "";
		}

		// 成功获取到值
		std::cout << "Execute command [ HGet " << key << " " << hkey
			<< " ] success! Value: " << *value << std::endl;
		return *value;
	}
	catch (const sw::redis::Error& e) {
		// 处理Redis操作错误
		std::cerr << "Execute command [ HGet " << key << " " << hkey
			<< " ] failure! Error: " << e.what() << std::endl;
		return "";
	}
	catch (const std::exception& e) {
		// 处理其他标准异常
		std::cerr << "Execute command [ HGet " << key << " " << hkey
			<< " ] failure! Std error: " << e.what() << std::endl;
		return "";
	}
}
bool RedisMgr::HDel(const std::string& key, const std::string& hkey) {
	try {
		long long i = redis_->hdel(key, hkey);
		if (i > 0) {
			std::cout << "Execut command [ HDEL " << key << " " << hkey << " ] success ! " << std::endl;
			return true;
		}
		else {
			std::cout << "Execut command [ HDEL " << key << " " << hkey << " ] failure ! " << std::endl;
			return false;
		}
	}
	catch (const sw::redis::Error& e) {
		std::cerr << "Execute command [ HDEL " << key << " " << hkey
			<< " ] failure! Error: " << e.what() << std::endl;
		return false;
	}
	catch (const std::exception& e) {
		std::cerr << "Execute command [ HDEL " << key << " " << hkey
			<< " ] failure! Std error: " << e.what() << std::endl;
		return false;
	}
}

// 小写别名，兼容用户可能使用的不同命名
bool RedisMgr::Hdel(const std::string& key, const std::string& hkey) {
	return HDel(key, hkey);
}
bool RedisMgr::Del(const std::string& key)
{
	try {
		long long i=redis_->del(key);
		if (i > 0) {
			std::cout << "Execut command [ Del " << key << " ] success ! " << std::endl;
			return true;
		}
		else {
			std::cout << "Execut command [ Del " << key << " ] failure ! " << std::endl;
			return false;
		}
	}
	catch (const sw::redis::Error& e) {
		// 处理Redis操作错误
		std::cerr << "Execute command [ Del " << key << " " << key
			<< " ] failure! Error: " << e.what() << std::endl;
		return false;
	}
	catch (const std::exception& e) {
		// 处理其他标准异常
		std::cerr << "Execute command [ HGet " << key << " " << key
			<< " ] failure! Std error: " << e.what() << std::endl;
		return false;
	}
}


bool RedisMgr::ExistsKey(const std::string& key) {
	try {
		// 使用redis++的exists方法
		bool exists = redis_->exists(key);

		if (exists) {
			std::cout << "Found [ Key " << key << " ] exists !" << std::endl;
		}
		else {
			std::cout << "Not Found [ Key " << key << " ] !" << std::endl;
		}

		return exists;
	}
	catch (const sw::redis::Error& e) {
		// 处理Redis操作错误
		std::cerr << "Check key existence failed for [ Key " << key
			<< " ]! Error: " << e.what() << std::endl;
		return false;
	}
	catch (const std::exception& e) {
		// 处理其他标准异常
		std::cerr << "Check key existence failed for [ Key " << key
			<< " ]! Std error: " << e.what() << std::endl;
		return false;
	}
}

void RedisMgr::close_connect()
{
	redis_.reset();
}
















