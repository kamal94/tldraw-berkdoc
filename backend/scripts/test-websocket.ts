#!/usr/bin/env bun
/**
 * Simple WebSocket test script for the boards gateway
 * 
 * Usage: bun run scripts/test-websocket.ts
 * 
 * NOTE: The user must exist in the database for the connection to succeed.
 * If you get "User not found", you need to create the user first.
 */

import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const WS_PORT = process.env.WS_PORT || '3001';
const WS_URL = `ws://localhost:${WS_PORT}`;

// User details
const userId = 'user_1767767161552_5920xb5';
const userEmail = 'test@example.com';
const userName = 'Test User';

// Generate JWT token
const payload = {
  sub: userId,
  email: userEmail,
  name: userName,
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

console.log('=== WebSocket Test Script ===\n');
console.log('JWT Token:');
console.log(token);
console.log('\nDecoded payload:');
console.log(JSON.stringify(payload, null, 2));
console.log('\n--- Connection Info ---');
console.log(`WebSocket URL: ${WS_URL}?token=${token}`);
console.log('\n--- Connecting... ---\n');

// Create WebSocket connection
const ws = new WebSocket(`${WS_URL}?token=${token}`);

ws.on('open', () => {
  console.log('✅ Connected successfully!');
  console.log('Waiting for messages... (press Ctrl+C to exit)\n');
});

ws.on('message', (data) => {
  console.log('📥 Received:', data.toString());
});

ws.on('close', (code, reason) => {
  console.log(`\n❌ Connection closed: ${code} - ${reason.toString()}`);
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

// Keep the script running
process.on('SIGINT', () => {
  console.log('\nClosing connection...');
  ws.close();
  process.exit(0);
});
