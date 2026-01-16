import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { BoardsRoomManager } from './boards.room-manager';
import { AuthService } from '../auth/auth.service';
import type { JwtPayload } from '../auth/entities/user.entity';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class BoardsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BoardsGateway.name);
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly roomManager: BoardsRoomManager,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly databaseService: DatabaseService
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
    const { token, boardId } = this.extractConnectionParams(request);
    
    if (!token) {
      this.logger.warn('WebSocket connection rejected: No token provided');
      socket.close(4001, 'Authentication required');
      return;
    }

    if (!boardId) {
      this.logger.warn('WebSocket connection rejected: No boardId provided');
      socket.close(4001, 'Board ID required');
      return;
    }

    const userId = await this.authenticateConnection(token);
    if (!userId) {
      socket.close(4001, 'Authentication failed');
      return;
    }

    const isValidBoard = await this.validateBoardAccess(boardId, userId);
    if (!isValidBoard) {
      socket.close(4003, 'Board not found');
      return;
    }

    const sessionId = this.generateSessionId(userId, boardId);
    this.logger.log(
      `WebSocket connection established for user ${userId}, board ${boardId}, session ${sessionId}`
    );

    await this.connectToRoom(socket, boardId, sessionId, userId);
  }

  private extractConnectionParams(request: IncomingMessage): { token: string | null; boardId: string | null } {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    return {
      token: url.searchParams.get('token'),
      boardId: url.searchParams.get('boardId'),
    };
  }

  private async authenticateConnection(token: string): Promise<string | null> {
    let payload: JwtPayload;
    try {
      const secret = this.configService.get<string>('JWT_SECRET') || 'default-secret';
      payload = this.jwtService.verify<JwtPayload>(token, { secret });
    } catch (error) {
      this.logger.error('WebSocket connection rejected: Invalid token', error);
      return null;
    }

    const user = await this.authService.validateUserById(payload.sub);
    if (!user) {
      this.logger.warn('WebSocket connection rejected: User not found');
      return null;
    }

    return user.id;
  }

  private async validateBoardAccess(boardId: string, userId: string): Promise<boolean> {
    const boardRow = this.databaseService.findBoardById(boardId);
    if (!boardRow || boardRow.user_id !== userId) {
      this.logger.warn('WebSocket connection rejected: Board not found');
      return false;
    }
    return true;
  }

  private generateSessionId(userId: string, boardId: string): string {
    return `${userId}-${boardId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private createWebSocketAdapter(socket: WebSocket) {
    return {
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
  }

  private async connectToRoom(
    socket: WebSocket,
    boardId: string,
    sessionId: string,
    userId: string
  ): Promise<void> {
    const room = await this.roomManager.getOrCreateRoom(boardId);
    const wsAdapter = this.createWebSocketAdapter(socket);

    room.handleSocketConnect({
      sessionId,
      socket: wsAdapter,
      isReadonly: false,
    });

    socket.on('close', () => {
      this.logger.log(
        `WebSocket closed for user ${userId}, board ${boardId}, session ${sessionId}`
      );
    });

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
