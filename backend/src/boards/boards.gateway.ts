import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { BoardsRoomManager } from './boards.room-manager';
import { AuthService } from '../auth/auth.service';
import type { JwtPayload } from '../auth/entities/user.entity';

@Injectable()
export class BoardsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BoardsGateway.name);
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly roomManager: BoardsRoomManager,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService
  ) {}

  onModuleInit() {
    this.setupWebSocketServer();
  }

  onModuleDestroy() {
    this.cleanup();
  }

  private setupWebSocketServer() {
    const port = parseInt(this.configService.get<string>('WS_PORT') || '3001', 10);

    this.wss = new WebSocketServer({ port });

    this.wss.on('listening', () => {
      this.logger.log(`WebSocket server listening on port ${port}`);
    });

    this.wss.on('connection', async (socket: WebSocket, request: IncomingMessage) => {
      try {
        await this.handleConnection(socket, request);
      } catch (error) {
        this.logger.error('Error handling WebSocket connection:', error);
        socket.close(4001, 'Connection error');
      }
    });

    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error:', error);
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
    const sessionId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.logger.log(`WebSocket connection established for user ${userId}, session ${sessionId}`);

    // Get or create room for this user
    const room = await this.roomManager.getOrCreateRoom(userId);

    // Create a minimal WebSocket adapter for tldraw
    const wsAdapter = {
      send: (data: string) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        }
      },
      close: (code?: number, reason?: string) => {
        socket.close(code, reason);
      },
      readyState: socket.readyState,
      addEventListener: (type: string, listener: (event: { data: string }) => void) => {
        if (type === 'message') {
          socket.on('message', (data: Buffer | string) => {
            listener({ data: data.toString() });
          });
        } else if (type === 'close') {
          socket.on('close', listener);
        } else if (type === 'error') {
          socket.on('error', listener);
        }
      },
      removeEventListener: (type: string, listener: (event: { data: string }) => void) => {
        socket.off(type, listener);
      },
    };

    // Connect socket to room
    room.handleSocketConnect({
      sessionId,
      socket: wsAdapter,
      isReadonly: false,
    });

    // Handle socket close
    socket.on('close', () => {
      this.logger.log(`WebSocket closed for user ${userId}, session ${sessionId}`);
    });

    // Handle socket error
    socket.on('error', (error) => {
      this.logger.error(`WebSocket error for user ${userId}:`, error);
    });
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

    // Dispose all rooms
    this.roomManager.disposeAllRooms();

    this.logger.log('WebSocket server cleaned up');
  }
}
