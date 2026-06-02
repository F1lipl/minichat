#include"const.h"
#include"Cserver.h"
#include"ConfigMgr.h"
#include <cstdlib>
#include <iostream>
#include <streambuf>

namespace {
class NullBuffer : public std::streambuf {
protected:
    std::streambuf::int_type overflow(std::streambuf::int_type ch) override
    {
        return traits_type::not_eof(ch);
    }
};

void DisableStdLogIfRequested()
{
    char flag[8] = {};
    size_t required = 0;
    getenv_s(&required, flag, sizeof(flag), "MINICHAT_DISABLE_STD_LOG");
    if (required == 0 || flag[0] == '\0' || (flag[0] == '0' && flag[1] == '\0')) {
        return;
    }

    static NullBuffer null_buffer;
    std::cout.rdbuf(&null_buffer);
    std::cerr.rdbuf(&null_buffer);
}
}

int main()
{
    DisableStdLogIfRequested();
    auto& gCfgMgr = ConfigMgr::Inst();
    std::string gate_port_str = gCfgMgr["GateServer"]["Port"];
    unsigned short gate_port = atoi(gate_port_str.c_str());

    try
    {
        unsigned short port = static_cast<unsigned short>(8080);
        net::io_context ioc{ 1 };
        boost::asio::signal_set signals(ioc, SIGINT, SIGTERM);
        signals.async_wait([&ioc](const boost::system::error_code& error, int signal_number) {
            if (error) {
                return;
            }
            ioc.stop();
            });
        std::make_shared<Cserver>(ioc, port)->start();
        ioc.run();
    }
    catch (std::exception const& e)
    {
        std::cerr << "Error: " << e.what() << std::endl;
        return EXIT_FAILURE;
    }
}
