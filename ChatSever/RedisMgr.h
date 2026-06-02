#pragma once
#include"const.h"
#include"Singleton.h"
#include<sw/redis++/redis++.h>
#include<vector>
using namespace sw::redis;
class RedisMgr:public Singleton<RedisMgr>,public std::enable_shared_from_this<RedisMgr>
{
	friend class Singleton<RedisMgr>;
public:
	~RedisMgr();
    bool Get(const std::string& key, std::string& value);
    bool Set(const std::string& key, const std::string& value);
    bool Auth(const std::string& password);
    bool LPush(const std::string& key, const std::string& value);
    bool LPop(const std::string& key, std::string& value);
    bool RPush(const std::string& key, const std::string& value);
    bool RPop(const std::string& key, std::string& value);
    bool SAdd(const std::string& key, const std::string& member);
    bool SRem(const std::string& key, const std::string& member);
    std::vector<std::string> SMembers(const std::string& key);
    bool HSet(const std::string& key, const std::string& hkey, const std::string& value);
    bool HSet(const char* key, const char* hkey, const char* hvalue, size_t hvaluelen);
    bool HDel(const std::string& key, const std::string& hkey);
    bool Hdel(const std::string& key, const std::string& hkey);
    std::string HGet(const std::string& key, const std::string& hkey);
    bool Del(const std::string& key);
    bool ExistsKey(const std::string& key);
    void close_connect();




private:
	RedisMgr();
	/*ConnectionOptions option_;
	ConnectionPoolOptions Pooloption_;*/
	std::unique_ptr<Redis>redis_;



};


