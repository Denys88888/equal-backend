import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

const ALLOWED_ORIGINS = [
  'https://equal-app.onrender.com',
  'https://denys88888.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
];

@WebSocketGateway({ cors: { origin: ALLOWED_ORIGINS, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  constructor(private jwtService: JwtService) {}

  handleConnection(client: Socket) {
    // Extract JWT from handshake auth or query param (Socket.io clients send via auth.token)
    const token =
      (client.handshake.auth as Record<string, string> | undefined)?.token ??
      (client.handshake.query?.token as string | undefined);

    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      client.data['userId'] = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:match')
  handleJoinMatch(client: Socket, matchId: string) {
    if (!client.data['userId']) throw new WsException('Unauthorized');
    client.join(`match:${matchId}`);
    return { event: 'joined', matchId };
  }

  @SubscribeMessage('message:send')
  handleMessage(client: Socket, payload: { matchId: string; content: string }) {
    const senderId = client.data['userId'] as string | undefined;
    if (!senderId) throw new WsException('Unauthorized');
    this.server.to(`match:${payload.matchId}`).emit('message:new', {
      matchId: payload.matchId,
      content: payload.content,
      senderId,  // always the server-verified userId, never trusting client
      createdAt: new Date().toISOString(),
    });
    return { event: 'sent', matchId: payload.matchId };
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(client: Socket, payload: { matchId: string }) {
    const userId = client.data['userId'] as string | undefined;
    if (!userId) throw new WsException('Unauthorized');
    client.to(`match:${payload.matchId}`).emit('typing:start', { userId });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(client: Socket, payload: { matchId: string }) {
    const userId = client.data['userId'] as string | undefined;
    if (!userId) throw new WsException('Unauthorized');
    client.to(`match:${payload.matchId}`).emit('typing:stop', { userId });
  }
}
