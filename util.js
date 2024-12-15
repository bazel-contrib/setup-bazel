// https://www.npmjs.com/package/get-folder-size
// Adapted for CommonJS and synchronous Filesystem calls.

const fs = require('fs')
const path = require('path')
const { createClient } = require("@connectrpc/connect")
const { createGrpcTransport } = require("@connectrpc/connect-node")
const { StickyDiskService } = require("@buf/blacksmith_vm-agent.connectrpc_es/stickydisk/v1/stickydisk_connect")

function createStickyDiskClient() {
  const transport = createGrpcTransport({
    baseUrl: 'http://192.168.127.1:5557',
    httpVersion: '2'
  });

  return createClient(StickyDiskService, transport);
}

module.exports = { createStickyDiskClient }