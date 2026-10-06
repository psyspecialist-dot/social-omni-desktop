module.exports = name => {
  try { return require(name); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const loader = require;
    return loader(require('node:path').join(__dirname,'../../artifacts/api-server/node_modules',name));
  }
};
