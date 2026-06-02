const { v4: uuidv4 } = require('uuid');
const emailModule = require('./email');
const config = require('./config');
const constModule = require('./const');
const grpc = require('@grpc/grpc-js');
const messageProto = require('./proto');
const redisModule = require('./redis');

const CODE_EXPIRE_SECONDS = 60;

function createCode() {
  return uuidv4().replace(/-/g, '').slice(0, 4);
}

async function GetVarifyCode(call, callback) {
  const email = call.request.email;
  console.log('email is ', email);

  try {
    const key = constModule.code_prefix + email;
    const code = createCode();
    const saved = await redisModule.SetRedisExpire(key, code, CODE_EXPIRE_SECONDS);

    if (!saved) {
      callback(null, {
        email,
        error: constModule.Errors.RedisErr,
      });
      return;
    }

    console.log('code generated for ', email);

    const mailOptions = {
      from: config.email_user,
      to: email,
      subject: '\u9a8c\u8bc1\u7801',
      text: `\u60a8\u7684\u9a8c\u8bc1\u7801\u4e3a ${code}\uff0c\u8bf7\u5728 ${CODE_EXPIRE_SECONDS} \u79d2\u5185\u5b8c\u6210\u9a8c\u8bc1\u3002`,
    };

    const sendResult = await emailModule.SendMail(mailOptions);
    console.log('send res is ', sendResult);

    callback(null, {
      email,
      error: constModule.Errors.Success,
    });
  } catch (error) {
    console.log('catch error is ', error);
    callback(null, {
      email,
      error: constModule.Errors.Exception,
    });
  }
}

function main() {
  const server = new grpc.Server();
  server.addService(messageProto.VarifyService.service, { GetVarifyCode });
  server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    server.start();
    console.log('grpc server started');
  });
}

main();
