const fs = require('fs');
let config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
// 安全地读取配置，如果不存在则使用默认值
let email_user = config.email?.user || '';
let email_pass = config.email?.pass || '';
let email_host = config.email?.host || 'smtp.163.com';
let email_port = config.email?.port || 465;
let email_secure = config.email?.secure !== false;
let mysql_host = config.mysql?.host || '';
let mysql_port = config.mysql?.port || '';
let redis_host = config.redis?.host || '';
let redis_port = config.redis?.port || '';
let redis_passwd = config.redis?.passwd || '';
let code_prefix = "code_";

module.exports = {email_pass, email_user, email_host, email_port, email_secure, mysql_host, mysql_port, redis_host, redis_port, redis_passwd, code_prefix};
