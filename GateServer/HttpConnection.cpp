#include"HttpConnection.h"
#include"LogicSystem.h"
HttpConnection::HttpConnection(boost::asio::io_context& ioc) :socket_(ioc) {}


void HttpConnection::start() {
	auto self = shared_from_this();
	http::async_read(socket_, buffer_, request_, [self](beast::error_code ec,std::size_t bytes_transferred) {
		try
		{
			if (ec) {
				std::cout << "http read err is" << ec.what() << std::endl;
				return;
			}
			boost::ignore_unused(bytes_transferred);
			self->CheckDeadline();
			self->HandleReq();
		}
		catch (const std::exception& exp)
		{
			std::cout << "exception is" << exp.what() << std::endl;
		}
		});
}

unsigned char ToHex(unsigned char x) {
	return x > 9 ? x + 55 : x + 48;
}

unsigned char FromHex(unsigned char x) {
	unsigned char y;
	if (x >= 'A' && x <= 'z')y = x - 'A' + 10;
	else if (x >= 'a' && x <= 'z')y = x - 'a' + 10;
	else y = x - '0';
	return y;
}


std::string UrlEncode(const std::string& str)//url编码
{
	std::string strTemp = "";
	size_t length = str.length();
	for (size_t i = 0; i < length; i++)
	{
		//判断是否仅有数字和字母构成
		if (isalnum((unsigned char)str[i]) ||
			(str[i] == '-') ||
			(str[i] == '_') ||
			(str[i] == '.') ||
			(str[i] == '~'))
			strTemp += str[i];
		else if (str[i] == ' ') //为空字符
			strTemp += "+";
		else
		{
			//其他字符需要提前加%并且高四位和低四位分别转为16进制
			strTemp += '%';
			strTemp += ToHex((unsigned char)str[i] >> 4);//汉字前加百分号后十六位分成高四位和低四位分别转换
			strTemp += ToHex((unsigned char)str[i] & 0x0F);
		}
	}
	return strTemp;
}


std::string UrlDecode(const std::string& str)//url解码
{
	std::string strTemp = "";
	size_t length = str.length();
	for (size_t i = 0; i < length; i++)
	{
		//还原+为空
		if (str[i] == '+') strTemp += ' ';
		//遇到%将后面的两个字符从16进制转为char再拼接
		else if (str[i] == '%')
		{
			assert(i + 2 < length);
			unsigned char high = FromHex((unsigned char)str[++i]);
			unsigned char low = FromHex((unsigned char)str[++i]);
			strTemp += (high << 4 )+ low;
		}
		else strTemp += str[i];
	}
	return strTemp;

}



void HttpConnection::HandleReq() {
	//设置版本
	response_.version(request_.version());
	response_.keep_alive(false);
	if (request_.method() == http::verb::get) {
		PreParseGetParam();
		bool success = LogicSystem::GetInstance()->HandleGet(get_url_,shared_from_this());
		if (!success) {
			response_.result(http::status::not_found);
			response_.set(http::field::content_type, "text/plain");
			beast::ostream(response_.body()) << "url not found\r\n";
			WriteResponse();
			return;
		}
		response_.result(http::status::ok);
		response_.set(http::field::server, "GateServer");
		WriteResponse();
		return;
	}
	if (request_.method() == http::verb::post) {
		bool success = LogicSystem::GetInstance()->HandlePost(request_.target(),shared_from_this());
		if (!success) {
			response_.result(http::status::not_found);
			response_.set(http::field::content_type, "text/json");
			beast::ostream(response_.body()) << "url not found";
			WriteResponse();
		}
		response_.result(http::status::ok);
		response_.set(http::field::server, "GateServer");
		WriteResponse();
		return;
	}
}

void HttpConnection::WriteResponse() {
	auto self = shared_from_this();
	request_.content_length(request_.body().size());//设置包首长度，防止粘包；
	http::async_write(socket_, response_, [self](beast::error_code ec, std::size_t bytes_transferred) {
		self->socket_.shutdown(tcp::socket::shutdown_send, ec);
		self->deadline_.cancel();
		});

}

//curl "http://localhost:8080/api/user?name=Alice&age=25"
//# 输出: Hello, Alice!You are 25 years old.
//
//curl "http://localhost:8080/api/user?name=Bob"
//# 输出 : Hello, Bob!You are 0 years old.
//
//curl "http://localhost:8080/api/user"
//# 输出 : Error : 'name' parameter is required.


//void HttpConnection::PreParseGetParam()
//{
//	//提取url
//	std::string url = request_.target();
//	//查询字符串的key与val在？之后
//	auto query_pos = url.find('?');
//	if (query_pos == std::string::npos) {//当 find、rfind 等查找函数没有找到目标子串或字符时，会返回 npos
//		get_url_ = url;
//		return;
//	}
//	get_url_ = url.substr(0,query_pos);//url路由
//	std::string querty_string = url.substr(query_pos + 1);
//	std::string key;
//	std::string val;
//	size_t pos = 0;
//	while (pos = querty_string.find('&') != std::string::npos) {
//		auto pair = querty_string.substr(0, pos);
//		size_t eq_pos = pair.find('=');
//		if (eq_pos != std::string::npos) {
//			key = UrlDecode(pair.substr(0, eq_pos));
//			val = UrlDecode(pair.substr(eq_pos+1));
//			get_pragma_[key] = val;
//		}
//		querty_string.erase(0, pos+1);
//	}
//	if (!querty_string.empty()) {
//		size_t eq_pos = querty_string.find('=');
//		key = UrlDecode(querty_string.substr(0, eq_pos));
//		val = UrlDecode(querty_string.substr(eq_pos + 1));
//		get_pragma_[key] = val;
//	}
//	return;
//}

void HttpConnection::PreParseGetParam()
{
	std::string url = request_.target();
	auto query_pos = url.find('?');
	if (query_pos == std::string::npos) {
		get_url_ = url;
		return;
	}
	get_url_ = url.substr(0, query_pos);
	std::string query_string = url.substr(query_pos + 1);

	// 按 & 分割参数
	std::stringstream ss(query_string);
	std::string pair;
	while (std::getline(ss, pair, '&')) {
		size_t eq_pos = pair.find('=');
		if (eq_pos != std::string::npos) {
			std::string key = UrlDecode(pair.substr(0, eq_pos));
			std::string val = UrlDecode(pair.substr(eq_pos + 1));
			get_pragma_[key] = val;
		}
		else if (!pair.empty()) {
			// 没有等号的参数
			get_pragma_[UrlDecode(pair)] = "";
		}
	}
}


void HttpConnection::CheckDeadline() {
	auto self = shared_from_this();
	deadline_.async_wait([self](beast::error_code ec) {
		if (!ec) {
			self->socket_.close(ec);
			return;
		}
		});


}