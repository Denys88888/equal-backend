import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:match')
  handleJoinMatch(client: Socket, matchId: string) {
    client.join(`match:${matchId}`);
    return { event: 'joined', matchId };
  }

  @SubscribeMessage('message:send')
  handleMessage(client: Socket, payload: { matchId: string; content: string; senderId: string }) {
    this.server.to(`match:${payload.matchId}`).emit('message:new', {
      matchId: payload.matchId,
      content: payload.content,
      senderId: payload.senderId,
      createdAt: new Date().toISOString(),
    });
    return { event: 'sent', matchId: payload.matchId };
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(client: Socket, payload: { matchId: string; userId: string }) {
    client.to(`match:${payload.matchId}`).emit('typing:start', { userId: payload.userId });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(client: Socket, payload: { matchId: string; userId: string }) {
    client.to(`match:${payload.matchId}`).emit('typing:stop', { userId: payload.userId });
  }
}
