#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPortableMcp } from './mcp-v2.js';
import { Artifacts } from './artifacts.js';
const artifacts=new Artifacts();
const server=createPortableMcp({artifacts,owner:'local'});
const clean=setInterval(()=>artifacts.cleanup(),60000);clean.unref();
await server.connect(new StdioServerTransport());
process.once('SIGTERM',()=>server.close());
process.once('SIGINT',()=>server.close());
