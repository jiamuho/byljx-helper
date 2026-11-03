// 标准 npm install 优先；本机开发可复用临时测试依赖。
module.exports = name => {
  try { return require(name); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const path = require('node:path');
    return require(require.resolve(name, { paths: [path.join(require('node:os').tmpdir(), 'byljx-helper-tests', 'node_modules')] }));
  }
};
