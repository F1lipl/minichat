#include "MysqlMgr.h"
MysqlMgr::~MysqlMgr() {

}

int MysqlMgr::RegUser(const std::string& name, const std::string& email, const std::string& pwd, const std::string& icon)
{
	return dao_.RegUserTransaction(name, email, pwd, icon);
}

bool MysqlMgr::CheckEmail(const std::string& name, const std::string& email) {
	return dao_.CheckEmail(name, email);
}

bool MysqlMgr::UpdatePwd(const std::string& name, const std::string& pwd) {
	return dao_.UpdatePwd(name, pwd);
}

MysqlMgr::MysqlMgr() {
}

bool MysqlMgr::CheckPwd(const std::string& email, const std::string& pwd, UserInfo& userInfo) {
	return dao_.CheckPwd(email, pwd, userInfo);
}

bool MysqlMgr::TestProcedure(const std::string& email, int& uid, std::string& name) {
	return dao_.TestProcedure(email, uid, name);
}
