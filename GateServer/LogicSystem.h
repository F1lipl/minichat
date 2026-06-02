#pragma once
#include "Singleton.h"
#include <functional>
#include <map>
#include "const.h"

class HttpConnection;
class LogicSystem : public Singleton<LogicSystem> {
	friend class Singleton<LogicSystem>;
public:
	using HttpHandle = std::function<void(std::shared_ptr<HttpConnection>)>;
	bool HandleGet(std::string,std::shared_ptr<HttpConnection>);
	bool HandlePost(std::string, std::shared_ptr<HttpConnection>);
	void RegGet(std::string, HttpHandle handler);
	void RegPost(std::string, HttpHandle handler);
private:
	LogicSystem();
	std::map<std::string, HttpHandle>post_handlers;
	std::map<std::string, HttpHandle>get_handlers;
};