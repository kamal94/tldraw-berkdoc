import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { AuthService } from '../auth/auth.service';
import type { JwtPayload } from '../auth/entities/user.entity';
import { SmartExplorerService } from './smart-explorer.service';

interface SmartExplorerMessage {
  type: 'smart-explorer';
  query: string;
  limit?: number;
}

interface SmartExplorerStartedMessage {
  type: 'smart-explorer-started';
  jobId: string;
}

interface SmartExplorerCompleteMessage {
  type: 'smart-explorer-complete';
  jobId: string;
  success: boolean;
  count?: number;
  error?: string;
}

@Injectable()
export class AppGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppGateway.name);
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, WebSocket>(); // userId -> socket

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly smartExplorerService: SmartExplorerService,
  ) {}

  onModuleInit() {
    this.setupWebSocketServer();
  }

  onModuleDestroy() {
    this.cleanup();
  }

  private setupWebSocketServer() {
    // Cloud mode: attach to the main HTTP server at a path so the socket is
    // reachable through the Container front Worker (one exposed port). The
    // attachment happens in attachToServer(), called from bootstrap once the
    // HTTP server exists. Local dev keeps the standalone APP_WS_PORT listener.
    if (this.configService.get<string>('APP_WS_PATH')) {
      return;
    }

    const port = parseInt(this.configService.get<string>('APP_WS_PORT') || '3002', 10);
    this.wss = new WebSocketServer({ port });
    this.wss.on('listening', () => {
      this.logger.log(`App WebSocket server listening on port ${port}`);
    });
    this.registerWssHandlers();
  }

  /**
   * Cloud mode: bind the app WebSocket to the main HTTP server at APP_WS_PATH,
   * so it shares the container's single exposed port (3000) and is reachable
   * via the front Worker (e.g. wss://api.berkdoc.com/app-ws).
   */
  attachToServer(server: Server) {
    const path = this.configService.get<string>('APP_WS_PATH');
    if (!path || this.wss) {
      return;
    }
    this.wss = new WebSocketServer({ server, path });
    this.logger.log(`App WebSocket server attached to HTTP server at path ${path}`);
    this.registerWssHandlers();
  }

  private registerWssHandlers() {
    if (!this.wss) {
      return;
    }
    this.wss.on('connection', async (socket: WebSocket, request: IncomingMessage) => {
      try {
        await this.handleConnection(socket, request);
      } catch (error) {
        this.logger.error('Error handling WebSocket connection:', error);
        socket.close(4001, 'Connection error');
      }
    });

    this.wss.on('error', (error) => {
      this.logger.error('App WebSocket server error:', error);
    });
  }

  private async handleConnection(socket: WebSocket, request: IncomingMessage) {
    // Extract token from query params
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      this.logger.warn('WebSocket connection rejected: No token provided');
      socket.close(4001, 'Authentication required');
      return;
    }

    // Verify JWT token
    let payload: JwtPayload;
    try {
      const secret = this.configService.get<string>('JWT_SECRET') || 'default-secret';
      payload = this.jwtService.verify<JwtPayload>(token, { secret });
    } catch (error) {
      this.logger.error('WebSocket connection rejected: Invalid token', error);
      socket.close(4001, 'Invalid token');
      return;
    }

    // Validate user exists
    const user = await this.authService.validateUserById(payload.sub);
    if (!user) {
      this.logger.warn('WebSocket connection rejected: User not found');
      socket.close(4001, 'User not found');
      return;
    }

    const userId = user.id;
    this.logger.log(`App WebSocket connection established for user ${userId}`);

    // Store connection
    this.connections.set(userId, socket);

    // Set up message handler
    socket.on('message', (data: Buffer | string) => {
      try {
        const message = data.toString();
        this.handleMessage(socket, userId, message);
      } catch (error) {
        this.logger.error(`Error handling message from user ${userId}:`, error);
      }
    });

    // Handle socket close
    socket.on('close', () => {
      this.logger.log(`App WebSocket closed for user ${userId}`);
      this.connections.delete(userId);
    });

    // Handle socket error
    socket.on('error', (error) => {
      this.logger.error(`App WebSocket error for user ${userId}:`, error);
      this.connections.delete(userId);
    });
  }

  private handleMessage(socket: WebSocket, userId: string, message: string) {
    try {
      const data = JSON.parse(message) as SmartExplorerMessage;

      if (data.type === 'smart-explorer') {
        this.handleSmartExplorer(socket, userId, data.query, data.limit);
      } else {
        this.logger.warn(`Unknown message type from user ${userId}: ${data.type}`);
      }
    } catch (error) {
      this.logger.error(`Error parsing message from user ${userId}:`, error);
      this.sendError(socket, 'Invalid message format');
    }
  }

  private async handleSmartExplorer(
    socket: WebSocket,
    userId: string,
    query: string,
    limit?: number,
  ) {
    // Generate jobId
    const jobId = crypto.randomUUID();

    // Send started message immediately
    const startedMessage: SmartExplorerStartedMessage = {
      type: 'smart-explorer-started',
      jobId,
    };
    this.sendMessage(socket, startedMessage);

    // Process asynchronously (don't block WebSocket)
    this.processSmartExplorerAsync(socket, userId, jobId, query, limit).catch((error) => {
      this.logger.error(`Error in async smart explorer processing for user ${userId}:`, error);
    });
  }

  private async processSmartExplorerAsync(
    socket: WebSocket,
    userId: string,
    jobId: string,
    query: string,
    limit?: number,
  ) {
    try {
      const result = await this.smartExplorerService.processSmartExplorer(userId, query, limit);

      // Get the current socket connection (in case it was reconnected)
      const currentSocket = this.connections.get(userId) || socket;

      // Send completion message
      const completeMessage: SmartExplorerCompleteMessage = {
        type: 'smart-explorer-complete',
        jobId,
        success: true,
        count: result.count,
      };
      this.sendMessage(currentSocket, completeMessage);
    } catch (error) {
      // Get the current socket connection (in case it was reconnected)
      const currentSocket = this.connections.get(userId) || socket;

      // Send error completion message
      const errorMessage: SmartExplorerCompleteMessage = {
        type: 'smart-explorer-complete',
        jobId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
      this.sendMessage(currentSocket, errorMessage);
    }
  }

  private sendMessage(socket: WebSocket, message: unknown) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private sendError(socket: WebSocket, error: string) {
    this.sendMessage(socket, { type: 'error', error });
  }

  private cleanup() {
    if (this.wss) {
      // Close all connections
      this.wss.clients.forEach((client) => {
        client.close(1001, 'Server shutting down');
      });

      // Close the server
      this.wss.close();
      this.wss = null;
    }

    this.connections.clear();
    this.logger.log('App WebSocket server cleaned up');
  }
}
