#include"LogicSystem.h"
#include"HttpConnection.h"
#include"VerifyGrpcClinet.h"
#include"RedisMgr.h"
#include"MysqlMgr.h"
#include"StatusGrpcClient.h"
void LogicSystem::RegGet(std::string url,HttpHandle handler) {
	get_handlers[url] = handler;
	return;
}
void LogicSystem::RegPost(std::string url, HttpHandle handler) {
    post_handlers[url] = handler;
    return;
}


LogicSystem::LogicSystem() {
    RegGet("/get_test", [](std::shared_ptr<HttpConnection> connection) {
        beast::ostream(connection->response_.body()) << "receive get_test req " << std::endl;
        int i = 0;
        for (auto& elem : connection->get_pragma_){
            i++;
            beast::ostream(connection->response_.body()) << "param" << i << " key is " << elem.first;
            beast::ostream(connection->response_.body()) << ", " << " value is " << elem.second << std::endl;
        }
        });
    RegPost("/get_varifycode",[](std::shared_ptr<HttpConnection>connection) {
        auto body_str = boost::beast::buffers_to_string(connection->request_.body().data());
        std::cout << "receive body is" << body_str << std::endl;
        connection->request_.set(http::field::content_type, "text/josn");
        Json::Value root;
        Json::Reader reader;
        Json::Value src_root;
        bool parse_success = reader.parse(body_str, src_root);
        if (!parse_success) {
            std::cout << "Failed to parse json";
            root["error"] = ErrorCodes::Error_Json;
            std::string jsonstr = root.toStyledString();
            beast::ostream(connection->response_.body()) << jsonstr;
            return true;
        }
        auto email = src_root["email"].asString();
        std::cout << "email is " << email <<std:: endl;
        // 调用gRPC客户端获取验证码
        std::cout << "准备调用gRPC服务获取验证码..." << std::endl;
        auto reply = VerifyGrpcClinet::GetInstance()->GetvarifyCode(email);

        // 处理gRPC调用结果
        std::cout << "gRPC调用返回，error码: " << reply.error() << std::endl;
        root["error"] = reply.error();
        root["email"] = reply.email();

        if (reply.error() == ErrorCodes::Success) {
            std::cout << "验证码服务调用成功" << std::endl;
        }
        else {
            std::cout << "验证码服务调用失败，错误码: " << reply.error() << std::endl;
        }

        std::string jsonstr = root.toStyledString();
        beast::ostream(connection->response_.body()) << jsonstr;
        return true;
        });


    RegPost("/user_register", [](std::shared_ptr<HttpConnection>connection) {
        auto bodystr = boost::beast::buffers_to_string(connection->request_.body().data());
        std::cout << "receive body is" << bodystr << std::endl;
        Json::Reader read;
        Json::Value root;
        Json::Value src_root;
        bool pass = read.parse(bodystr, src_root);
        connection->response_.set(http::field::content_type, "text/json");
        if (!pass) {
            std::cout << "Failed to parse JSON data!" << std::endl;
            root["error"] = ErrorCodes::Error_Json;
            auto json_str = root.toStyledString();
            beast::ostream(connection->response_.body()) << json_str;
            return true;
        }
        auto email = src_root["email"].asString();
        auto name = src_root["user"].asString();
        auto pwd = src_root["passwd"].asString();
        auto confirm = src_root["confirm"].asString();
        auto icon = src_root["icon"].asString();

        if (pwd != confirm) {
            std::cout << "password err " << std::endl;
            root["error"] = ErrorCodes::PasswdErr;
            std::string jsonstr = root.toStyledString();
            beast::ostream(connection->response_.body()) << jsonstr;
            return true;
        }
        std::string varify_code;
        bool get_varify = RedisMgr::GetInstance()->Get(CODEPREFIX + src_root["email"].asString(), varify_code);
        if(!get_varify){
            std::cout << " get varify code expired" << std::endl;
            root["error"] = ErrorCodes::VarifyExpired;
            beast::ostream(connection->response_.body()) << root.toStyledString();
            return true;
        }
        if (varify_code != src_root["varifycode"].asString()) {
            std::cout << "varifycode is wrong" << std::endl;
            root["error"] = ErrorCodes::VarifyCodeErr;
            beast::ostream(connection->response_.body()) << root.toStyledString();
            return true;
        }

        //查找数据库判断用户是否存在
        int uid = MysqlMgr::GetInstance()->RegUser(name, email, pwd, icon);
        if (uid == 0 || uid == -1) {
            std::cout << " user or email exist" << std::endl;
            root["error"] = ErrorCodes::UserExist;
            std::string jsonstr = root.toStyledString();
            beast::ostream(connection->response_.body()) << jsonstr;
            return true;
        }
        root["error"] = 0;
        root["uid"] = uid;
        root["email"] = email;
        root["user"] = name;
        root["passwd"] = pwd;
        root["confirm"] = confirm;
        root["icon"] = icon;
        root["varifycode"] = src_root["varifycode"].asString();
        std::string jsonstr = root.toStyledString();
        beast::ostream(connection->response_.body()) << jsonstr;
        return true;
        });

    RegPost("/reset_pwd", [](std::shared_ptr<HttpConnection>connection) {
        std::string body_str = boost::beast::buffers_to_string(connection->request_.body().data());
        Json::Reader reader;
        Json::Value src_root;
        Json::Value root;
        std::cout << "receive body is " << body_str << std::endl;
        connection->response_.set(http::field::content_type, "text/json");
        bool parse_success = reader.parse(body_str, src_root);
        if (!parse_success) {
            std::cout << "Failed to parse JSON data!" << std::endl;
            root["error"] = ErrorCodes::Error_Json;
            std::string jsonstr = root.toStyledString();
            beast::ostream(connection->response_.body()) << jsonstr;
            return true;
        }
        auto email = src_root["email"].asString();
        auto name = src_root["name"].asString();
        auto pwd = src_root["passwd"].asString();


        //先查找redis中email对应的验证码是否合理
        std::string varify_code;
        bool get_varify = RedisMgr::GetInstance()->Get(CODEPREFIX + email, varify_code);
        if (!get_varify) {
            std::cout << " get varify code expired" << std::endl;
            root["error"] = ErrorCodes::VarifyExpired;
            beast::ostream(connection->response_.body()) << root.toStyledString();
            return true;
        }
        if (varify_code != src_root["varifycode"].asString()) {
            std::cout << "varify code error " << std::endl;
            root["error"] = ErrorCodes::VarifyCodeErr;
            beast::ostream(connection->response_.body()) << root.toStyledString();
            return true;
        }
        //查询数据库判断用户名和邮箱是否匹配
        bool email_valid = MysqlMgr::GetInstance()->CheckEmail(name, email);
        if(!email_valid){
            std::cout << " user email not match" << std::endl;
            root["error"] = ErrorCodes::EmailNotMatch;
            beast::ostream(connection->response_.body()) << root.toStyledString();
            return true;
        
        }
        bool b_up = MysqlMgr::GetInstance()->UpdatePwd(name, pwd);
        if (!b_up) {
            std::cout << " update pwd failed" << std::endl;
            root["error"] = ErrorCodes::PasswdUpFailed;
            std::string jsonstr = root.toStyledString();
            beast::ostream(connection->response_.body()) << jsonstr;
            return true;
        }
        std::cout << "succeed to update password" << pwd << std::endl;
        root["email"] = email;
        root["name"] = name;
        root["passwd"] = pwd;
        root["error"] = 0;
        root["varifycode"] = src_root["varifycode"].asString();
        std::string jsonstr = root.toStyledString();
        beast::ostream(connection->response_.body()) << jsonstr;
        return true;

        });


    RegPost("/user_login", [](std::shared_ptr<HttpConnection>connection) {
        auto body_str = boost::beast::buffers_to_string(connection->request_.body().data());
        std::cout << "receive body is " << body_str << std::endl;
        connection->response_.set(http::field::content_type, "text/json");
        Json::Reader reader;
        Json::Value root;
        Json::Value src_root;
        auto parse_success = reader.parse(body_str, src_root);
        if (!parse_success) {
            std::cout << "Failed to parse JSON data!" << std::endl;
            root["error"] = ErrorCodes::Error_Json;
            beast::ostream(connection->response_.body()) << root.toStyledString();
            return true;
        }
        auto email = src_root["email"].asString();
        auto pwd = src_root["passwd"].asString();
        UserInfo userInfo;
        //查询数据库判断用户名和密码是否匹配
        bool pwd_valid = MysqlMgr::GetInstance()->CheckPwd(email, pwd, userInfo);
        if (!pwd_valid) {
            std::cout << " user pwd not match" << std::endl;
            root["error"] = ErrorCodes::PasswdInvalid;
            std::string jsonstr = root.toStyledString();
            beast::ostream(connection->response_.body()) << jsonstr;
            return true;
        }

        //查询StatusServer找到合适的连接
        auto reply = StatusGrpcClient::GetInstance()->GetChatServer(userInfo.uid);
        if (reply.error()) {
            std::cout << " grpc get chat server failed, error is " << reply.error() << std::endl;
            root["error"] = ErrorCodes::RPCFailed;
            std::string jsonstr = root.toStyledString();
            beast::ostream(connection->response_.body()) << jsonstr;
            return true;
        }

        std::cout << "succeed to load userinfo uid is " << userInfo.uid << std::endl;
        root["error"] = 0;
        root["email"] = email;
        root["uid"] = userInfo.uid;
        root["token"] = reply.token();
        root["host"] = reply.host();
        root["port"] = reply.port();
        std::string jsonstr = root.toStyledString();
        beast::ostream(connection->response_.body()) << jsonstr;
        return true;
        });
    
    
    
 



}

bool LogicSystem::HandleGet(std::string url, std::shared_ptr<HttpConnection> con) {
	auto i = get_handlers.find(url);
	if (i == get_handlers.end()) return false;
	get_handlers[url](con);
	return true;
}


bool LogicSystem::HandlePost(std::string url, std::shared_ptr<HttpConnection>con) {
    if (post_handlers.find(url) == post_handlers.end())return false;
    post_handlers[url](con);
    return true;
}
